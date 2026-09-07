import type { MinimalPlan, PlannedRecord } from './planner.ts';
import { chunkRecords } from './batching.ts';
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
  migrationRunId: string;
  planHash: string;
  appliedAt: string;
  mutations: ManifestMutation[];
  manifestHash: string;
};

export const applyPlan = async (
  plan: FrozenMigrationPlan,
  api: MigrationApi,
  now = new Date(),
): Promise<RollbackManifest> => {
  assertPlanIntegrity(plan);

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

      if (current?.sourceRowHmac === record.payload.sourceRowHmac) {
        continue;
      }

      actionable.set(objectPlural, [
        ...(actionable.get(objectPlural) ?? []),
        record,
      ]);
      mutations.push({
        objectPlural,
        id: record.targetId,
        sourceRowHmac: recordHmac(record),
        appliedPayloadHash: '',
        guardedFields,
        action: current ? 'updated' : 'created',
        ...(current
          ? {
              before: Object.fromEntries(
                guardedFields
                  .filter((key) => key !== 'id')
                  .map((key) => [key, current[key] ?? null]),
              ),
            }
          : {}),
      });
    }
  }

  for (const [objectPlural, records] of actionable) {
    const batches = chunkRecords(records.map(({ payload }) => payload));
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

  const body = {
    formatVersion: 1 as const,
    migrationRunId: plan.migrationRunId,
    planHash: plan.planHash,
    appliedAt: now.toISOString(),
    mutations,
  };

  return {
    ...body,
    manifestHash: sourceRowHmac(body, plan.planHash),
  };
};

export const verifyPlan = async (
  plan: FrozenMigrationPlan,
  api: MigrationApi,
): Promise<{ verified: number }> => {
  assertPlanIntegrity(plan);

  for (const record of plan.records) {
    const current = await api.getOne(record.objectPlural, record.targetId);

    if (
      current.legacyFetchId !== record.payload.legacyFetchId ||
      current.sourceRowHmac !== record.payload.sourceRowHmac
    ) {
      throw new Error(
        `Migration verification failed for ${record.objectPlural}/${record.targetId}`,
      );
    }
  }

  return { verified: plan.records.length };
};

export const rollback = async (
  manifest: RollbackManifest,
  api: MigrationApi,
): Promise<{ rolledBack: number }> => {
  const { manifestHash, ...body } = manifest;
  if (sourceRowHmac(body, manifest.planHash) !== manifestHash) {
    throw new Error('Rollback manifest hash mismatch');
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
