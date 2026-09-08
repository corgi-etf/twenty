import type { MinimalPlan, PlannedRecord } from './planner.ts';
import { chunkRecords, TWENTY_SAFE_BATCH_BODY_BYTES } from './batching.ts';
import {
  assertPlanIntegrity,
  contentHash,
  sourceRowHmac,
} from './integrity.ts';

export type FrozenMigrationPlan = MinimalPlan & {
  formatVersion: 1;
  migrationRunId: string;
  createdAt: string;
  planHash: string;
};

export type ExistingRecord = Record<string, unknown> & { id: string };

export type MigrationApi = {
  listAll(objectPlural: string): Promise<ExistingRecord[]>;
  batchUpsert(
    objectPlural: string,
    records: Record<string, unknown>[],
  ): Promise<void>;
  getOne(objectPlural: string, id: string): Promise<ExistingRecord>;
  patchOne(
    objectPlural: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  softDeleteOne(objectPlural: string, id: string): Promise<void>;
};

export type ManifestMutation = {
  objectPlural: string;
  id: string;
  sourceRowHmac: string | null;
  appliedPayloadHash: string;
  guardedFields: string[];
  action: 'created' | 'updated';
  before?: Record<string, unknown>;
};

export type RollbackManifest = {
  formatVersion: 1;
  status: 'applying' | 'complete';
  migrationRunId: string;
  planHash: string;
  appliedAt: string;
  mutations: ManifestMutation[];
  manifestHash: string;
};

export type ApplyPlanOptions = {
  resumeManifest?: RollbackManifest;
  checkpoint?: (manifest: RollbackManifest) => Promise<void>;
  maxBatchBodyBytes?: number;
};

const buildManifest = (
  plan: FrozenMigrationPlan,
  appliedAt: string,
  status: RollbackManifest['status'],
  mutations: ManifestMutation[],
): RollbackManifest => {
  const body = {
    formatVersion: 1 as const,
    status,
    migrationRunId: plan.migrationRunId,
    planHash: plan.planHash,
    appliedAt,
    mutations,
  };

  return {
    ...body,
    manifestHash: sourceRowHmac(body, plan.planHash),
  };
};

const assertManifestIntegrity = (manifest: RollbackManifest): void => {
  const { manifestHash, ...body } = manifest;

  if (sourceRowHmac(body, manifest.planHash) !== manifestHash) {
    throw new Error('Rollback manifest hash mismatch');
  }
};

export const applyPlan = async (
  plan: FrozenMigrationPlan,
  api: MigrationApi,
  now = new Date(),
  options: ApplyPlanOptions = {},
): Promise<RollbackManifest> => {
  assertPlanIntegrity(plan);

  const resumeManifest = options.resumeManifest;
  if (resumeManifest) {
    assertManifestIntegrity(resumeManifest);
    if (
      resumeManifest.planHash !== plan.planHash ||
      resumeManifest.migrationRunId !== plan.migrationRunId
    ) {
      throw new Error('Resume manifest does not match the migration plan');
    }
  }

  const appliedAt = resumeManifest?.appliedAt ?? now.toISOString();
  const previousMutations = new Map<string, ManifestMutation>();
  for (const mutation of resumeManifest?.mutations ?? []) {
    const key = `${mutation.objectPlural}:${mutation.id}`;
    if (previousMutations.has(key)) {
      throw new Error(`Resume manifest contains duplicate mutation ${key}`);
    }
    previousMutations.set(key, mutation);
  }

  const groups = new Map<string, PlannedRecord[]>();
  for (const record of plan.records) {
    groups.set(record.objectPlural, [
      ...(groups.get(record.objectPlural) ?? []),
      record,
    ]);
  }

  const actionable = new Map<string, PlannedRecord[]>();
  const mutations: ManifestMutation[] = [];

  // Complete every collision check before making the first write.
  for (const [objectPlural, records] of groups) {
    const existing = await api.listAll(objectPlural);
    const byId = new Map(existing.map((record) => [record.id, record]));
    const byLegacyId = new Map(
      existing
        .filter(({ legacyFetchId }) => typeof legacyFetchId === 'string')
        .map((record) => [record.legacyFetchId as string, record]),
    );

    for (const record of records) {
      const foundById = byId.get(record.targetId);
      const foundByLegacyId = byLegacyId.get(record.sourceId);

      if (
        foundById &&
        foundById.legacyFetchId !== undefined &&
        foundById.legacyFetchId !== record.sourceId
      ) {
        throw new Error(
          `Deterministic ID collision for ${objectPlural}/${record.targetId}`,
        );
      }
      if (foundByLegacyId && foundByLegacyId.id !== record.targetId) {
        throw new Error(
          `External key collision for ${objectPlural}/${record.sourceId}`,
        );
      }

      const current = foundById ?? foundByLegacyId;
      const guardedFields = Object.keys(record.payload).sort();
      const mutationKey = `${objectPlural}:${record.targetId}`;
      const previousMutation = previousMutations.get(mutationKey);
      const currentWasCreatedByRun =
        current?.migrationRunId === plan.migrationRunId;

      if (
        current?.sourceRowHmac === record.payload.sourceRowHmac &&
        currentWasCreatedByRun
      ) {
        if (previousMutation) {
          mutations.push(structuredClone(previousMutation));
          previousMutations.delete(mutationKey);
        } else if (currentWasCreatedByRun) {
          mutations.push({
            objectPlural,
            id: record.targetId,
            sourceRowHmac: recordHmac(record),
            appliedPayloadHash: '',
            guardedFields,
            action: 'created',
          });
        }
        continue;
      }

      if (previousMutation?.action === 'updated' && !current) {
        throw new Error(
          `Updated record disappeared during resume for ${objectPlural}/${record.targetId}`,
        );
      }

      actionable.set(objectPlural, [
        ...(actionable.get(objectPlural) ?? []),
        record,
      ]);
      mutations.push(
        previousMutation ?? {
          objectPlural,
          id: record.targetId,
          sourceRowHmac: recordHmac(record),
          appliedPayloadHash: '',
          guardedFields,
          action: current && !currentWasCreatedByRun ? 'updated' : 'created',
          ...(current && !currentWasCreatedByRun
            ? {
                before: Object.fromEntries(
                  guardedFields
                    .filter((key) => key !== 'id')
                    .map((key) => [key, current[key] ?? null]),
                ),
              }
            : {}),
        },
      );
      previousMutations.delete(mutationKey);
    }
  }

  if (previousMutations.size > 0) {
    throw new Error('Resume manifest contains records outside the plan');
  }

  const batchesByObject = new Map<string, Record<string, unknown>[][]>();
  for (const [objectPlural, records] of actionable) {
    batchesByObject.set(
      objectPlural,
      chunkRecords(
        records.map(({ payload }) => payload),
        100,
        options.maxBatchBodyBytes ?? TWENTY_SAFE_BATCH_BODY_BYTES,
        objectPlural,
      ),
    );
  }

  await options.checkpoint?.(
    buildManifest(plan, appliedAt, 'applying', mutations),
  );

  for (const [objectPlural, batches] of batchesByObject) {
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next];
        next += 1;
        if (batch) await api.batchUpsert(objectPlural, batch);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(2, batches.length) }, worker),
    );
  }

  for (const objectPlural of new Set(
    mutations.map((mutation) => mutation.objectPlural),
  )) {
    const currentById = new Map(
      (await api.listAll(objectPlural)).map((record) => [record.id, record]),
    );

    for (const mutation of mutations.filter(
      (item) => item.objectPlural === objectPlural,
    )) {
      const current = currentById.get(mutation.id);
      if (
        !current ||
        current.migrationRunId !== plan.migrationRunId ||
        current.sourceRowHmac !== mutation.sourceRowHmac
      ) {
        throw new Error(
          `Post-apply verification failed for ${objectPlural}/${mutation.id}`,
        );
      }
      mutation.appliedPayloadHash = contentHash(
        Object.fromEntries(
          mutation.guardedFields.map((key) => [key, current[key] ?? null]),
        ),
      );
    }
  }

  const manifest = buildManifest(plan, appliedAt, 'complete', mutations);
  await options.checkpoint?.(manifest);

  return manifest;
};

export const verifyPlan = async (
  plan: FrozenMigrationPlan,
  api: MigrationApi,
  manifest?: RollbackManifest,
): Promise<{ verified: number }> => {
  assertPlanIntegrity(plan);

  const manifestMutations = new Map<string, ManifestMutation>();
  if (manifest) {
    assertManifestIntegrity(manifest);
    if (manifest.status !== 'complete') {
      throw new Error('Cannot verify with an incomplete migration manifest');
    }
    if (
      manifest.planHash !== plan.planHash ||
      manifest.migrationRunId !== plan.migrationRunId
    ) {
      throw new Error(
        'Verification manifest does not match the migration plan',
      );
    }
    for (const mutation of manifest.mutations) {
      manifestMutations.set(
        `${mutation.objectPlural}:${mutation.id}`,
        mutation,
      );
    }
  }

  for (const objectPlural of new Set(
    plan.records.map((record) => record.objectPlural),
  )) {
    const currentById = new Map(
      (await api.listAll(objectPlural)).map((record) => [record.id, record]),
    );
    for (const record of plan.records.filter(
      (item) => item.objectPlural === objectPlural,
    )) {
      const current = currentById.get(record.targetId);

      if (
        !current ||
        current.legacyFetchId !== record.payload.legacyFetchId ||
        current.migrationRunId !== plan.migrationRunId ||
        current.sourceRowHmac !== record.payload.sourceRowHmac
      ) {
        throw new Error(
          `Migration verification failed for ${record.objectPlural}/${record.targetId}`,
        );
      }

      if (manifest) {
        const mutation = manifestMutations.get(
          `${record.objectPlural}:${record.targetId}`,
        );
        if (!mutation) {
          throw new Error(
            `Migration manifest omitted ${record.objectPlural}/${record.targetId}`,
          );
        }
        const projection = Object.fromEntries(
          mutation.guardedFields.map((key) => [key, current[key] ?? null]),
        );
        if (contentHash(projection) !== mutation.appliedPayloadHash) {
          throw new Error(
            `Migration payload verification failed for ${record.objectPlural}/${record.targetId}`,
          );
        }
        manifestMutations.delete(`${record.objectPlural}:${record.targetId}`);
      }
    }
  }

  if (manifestMutations.size > 0) {
    throw new Error('Migration manifest contains records outside the plan');
  }

  return { verified: plan.records.length };
};

export const rollback = async (
  manifest: RollbackManifest,
  api: MigrationApi,
): Promise<{ rolledBack: number }> => {
  assertManifestIntegrity(manifest);
  if (manifest.status !== 'complete') {
    throw new Error('Cannot roll back an incomplete migration apply');
  }

  const currentByMutation = new Map<ManifestMutation, ExistingRecord>();
  for (const mutation of manifest.mutations) {
    const current = await api.getOne(mutation.objectPlural, mutation.id);
    const projection = Object.fromEntries(
      mutation.guardedFields.map((key) => [key, current[key] ?? null]),
    );

    if (
      current.migrationRunId !== manifest.migrationRunId ||
      current.sourceRowHmac !== mutation.sourceRowHmac ||
      contentHash(projection) !== mutation.appliedPayloadHash
    ) {
      throw new Error(
        `Rollback hash guard rejected ${mutation.objectPlural}/${mutation.id}`,
      );
    }
    currentByMutation.set(mutation, current);
  }

  for (const mutation of [...manifest.mutations].reverse()) {
    if (mutation.action === 'created') {
      await api.softDeleteOne(mutation.objectPlural, mutation.id);
    } else {
      await api.patchOne(
        mutation.objectPlural,
        mutation.id,
        mutation.before ?? {},
      );
    }
  }

  return { rolledBack: currentByMutation.size };
};

export const recordHmac = (record: PlannedRecord): string | null =>
  typeof record.payload.sourceRowHmac === 'string'
    ? record.payload.sourceRowHmac
    : null;
