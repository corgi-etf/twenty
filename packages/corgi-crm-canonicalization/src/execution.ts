import { createHash } from 'node:crypto';

import {
  assertManagedMetadataConverged,
  buildMetadataPlan,
  type MetadataCreate,
  type MetadataObject,
} from './metadata.ts';
import { stableStringify } from './normalization.ts';
import {
  assertPlanCanApply,
  buildCanonicalizationPlan,
  type CanonicalizationSnapshot,
  type CrmRecord,
  type RecordMutation,
} from './planner.ts';
import {
  assertCanonicalizationComplete,
  assertReconciliationManifest,
  buildReconciliationReport,
  createReconciliationManifest,
  type ReconciliationManifest,
  type ReconciliationReport,
} from './reconciliation.ts';

export type CanonicalizationCheckpoint = {
  schemaVersion: 2;
  origin: string;
  manifest: ReconciliationManifest;
  expectedFinalManifest: ReconciliationManifest;
  recordIdentityCommitments: RecordIdentityCommitments;
  status: 'metadata' | 'records' | 'verifying' | 'complete';
  completedOperations: Array<{ key: string; sha256: string }>;
};

const TRACKED_RECORD_COLLECTIONS = [
  'companies',
  'people',
  'holdingObservations',
] as const;

type TrackedRecordCollection = (typeof TRACKED_RECORD_COLLECTIONS)[number];

export type RecordIdentityCommitments = Record<
  TrackedRecordCollection,
  { initialIdHashes: string[]; allowedCreateIdHashes: string[] }
>;

export type CanonicalizationApi = {
  listMetadataObjects(): Promise<MetadataObject[]>;
  listAll(objectPlural: keyof CanonicalizationSnapshot): Promise<CrmRecord[]>;
  renameMetadataField(
    fieldId: string,
    name: string,
    label: string,
  ): Promise<void>;
  createMetadataField(input: MetadataCreate): Promise<void>;
  upsertBatch(
    objectPlural: keyof CanonicalizationSnapshot,
    records: Array<CrmRecord>,
  ): Promise<void>;
  conditionalPatchOne(
    objectPlural: keyof CanonicalizationSnapshot,
    id: string,
    expectedUpdatedAt: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  readCheckpoint(): Promise<CanonicalizationCheckpoint | undefined>;
  writeCheckpoint(checkpoint: CanonicalizationCheckpoint): Promise<void>;
};

export type CanonicalizationRunOptions = {
  origin: string;
  expectedOrigin: string;
  mode?: 'dry-run' | 'apply';
  confirmation?: string;
  expectedManifest?: ReconciliationManifest;
  enforceProductionBaseline?: boolean;
};

export type CanonicalizationRunResult = {
  mode: 'dry-run' | 'apply';
  metadataRenames: number;
  metadataCreates: number;
  plannedRecordMutations: number;
  unresolved: number;
  manifest: ReconciliationManifest;
  reconciliation: ReconciliationReport;
};

const SNAPSHOT_COLLECTIONS = [
  'companies',
  'people',
  'sourceRecords',
  'importReviewItems',
  'holdingObservations',
  'tasks',
  'taskTargets',
  'wholesalers',
  'leadAssignments',
  'outreachActivities',
  'archivedOutreachActivities',
] as const satisfies readonly (keyof CanonicalizationSnapshot)[];

export const CANONICALIZATION_BATCH_SIZE = 100;
export const CANONICALIZATION_MAX_BATCH_BYTES = 8 * 1024 * 1024;

export const loadCanonicalizationSnapshot = async (
  api: Pick<CanonicalizationApi, 'listAll'>,
): Promise<CanonicalizationSnapshot> => {
  const snapshot: Partial<CanonicalizationSnapshot> = {};
  for (const name of SNAPSHOT_COLLECTIONS) {
    snapshot[name] = await api.listAll(name);
  }

  return snapshot as CanonicalizationSnapshot;
};

const parseObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const assertAuditedProductionBaseline = (
  snapshot: CanonicalizationSnapshot,
): void => {
  for (const [name, expected] of [
    ['sourceRecords', 2603],
    ['importReviewItems', 212],
    ['wholesalers', 10],
    ['archivedOutreachActivities', 5],
  ] as Array<[keyof CanonicalizationSnapshot, number]>) {
    if (snapshot[name].length !== expected) {
      throw new Error(`Audited baseline count mismatch for ${name}`);
    }
  }
  for (const [name, minimum] of [
    ['companies', 2191],
    ['people', 1961],
    ['holdingObservations', 331],
    ['tasks', 159],
    ['taskTargets', 159],
    ['outreachActivities', 986],
    // Lead assignments are active business records and may change after the
    // audited migration baseline. Keep a conservative completeness floor while
    // the trusted manifest and reconciliation protect the exact live set.
    ['leadAssignments', 4000],
  ] as Array<[keyof CanonicalizationSnapshot, number]>) {
    if (snapshot[name].length < minimum) {
      throw new Error(`Audited baseline is incomplete for ${name}`);
    }
  }

  const statuses = snapshot.importReviewItems.map((record) =>
    String(record.reviewStatus ?? '').toLowerCase(),
  );
  if (
    statuses.filter((status) => status === 'accepted').length !== 72 ||
    statuses.filter((status) => status === 'pending').length !== 140
  ) {
    throw new Error('Audited review-status baseline mismatch');
  }

  const relationCounts = {
    taskCompanies: snapshot.tasks.filter((record) => record.legacyCompanyId)
      .length,
    taskContacts: snapshot.tasks.filter((record) => record.legacyContactId)
      .length,
    taskWholesalers: snapshot.tasks.filter(
      (record) => record.legacyWholesalerId,
    ).length,
    outreachTasks: 0,
    outreachDates: 0,
  };
  for (const activity of snapshot.outreachActivities) {
    const metadata = parseObject(activity.fetchMetadata);
    if (metadata?.followUpId) relationCounts.outreachTasks += 1;
    if (metadata?.followUpDate) relationCounts.outreachDates += 1;
  }
  if (
    stableStringify(relationCounts) !==
    stableStringify({
      taskCompanies: 159,
      taskContacts: 150,
      taskWholesalers: 159,
      outreachTasks: 113,
      outreachDates: 58,
    })
  ) {
    throw new Error('Audited relation baseline mismatch');
  }

  let countryOnly = 0;
  let countryMismatch = 0;
  let manualLocations = 0;
  for (const company of snapshot.companies) {
    const country =
      typeof company.country === 'string' ? company.country.trim() : '';
    const address = company.address as { addressCountry?: unknown } | undefined;
    const addressCountry =
      typeof address?.addressCountry === 'string'
        ? address.addressCountry.trim()
        : '';
    if (country && !addressCountry) countryOnly += 1;
    if (country && addressCountry && country !== addressCountry) {
      countryMismatch += 1;
    }
    if (company.locationIsManual === true) manualLocations += 1;
  }
  if (countryOnly || countryMismatch || manualLocations) {
    throw new Error('Audited company location baseline mismatch');
  }
};

const sha256 = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Cannot hash a non-JSON canonicalization operation');
  }

  return createHash('sha256')
    .update(stableStringify(JSON.parse(serialized)), 'utf8')
    .digest('hex');
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function assertTrustedManifestShape(
  value: unknown,
): asserts value is ReconciliationManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Trusted canonicalization manifest has an invalid shape');
  }
  const manifest = value as Record<string, unknown>;
  const countFields = [
    'sourceRecordRows',
    'reviewItemRows',
    'holdingRawRows',
    'companyRecords',
    'personRecords',
    'holdingRecords',
    'stagingRows',
    'distinctBusinessRows',
    'duplicateRows',
    'nonemptyRawValues',
    'disposedRawValues',
  ];
  const hashFields = [
    'rowCoverageHash',
    'businessContentHash',
    'dispositionHash',
    'companyIdSetHash',
    'personIdSetHash',
    'holdingIdSetHash',
  ];
  const dispositions = manifest.dispositionsByKind;
  if (
    Object.keys(manifest).sort().join('\0') !==
      [...countFields, ...hashFields, 'dispositionsByKind'].sort().join('\0') ||
    countFields.some(
      (field) =>
        !Number.isSafeInteger(manifest[field]) ||
        (manifest[field] as number) < 0,
    ) ||
    hashFields.some(
      (field) =>
        typeof manifest[field] !== 'string' ||
        !HASH_PATTERN.test(manifest[field]),
    ) ||
    !dispositions ||
    typeof dispositions !== 'object' ||
    Array.isArray(dispositions) ||
    Object.entries(dispositions).some(
      ([kind, count]) =>
        !kind || !Number.isSafeInteger(count) || (count as number) < 0,
    )
  ) {
    throw new Error('Trusted canonicalization manifest has an invalid shape');
  }
}

const recordIdHash = (
  objectPlural: TrackedRecordCollection,
  id: string,
): string =>
  createHash('sha256').update(`${objectPlural}\0${id}`, 'utf8').digest('hex');

const sortedUniqueHashes = (hashes: Iterable<string>): string[] =>
  [...new Set(hashes)].sort();

export function assertRecordIdentityCommitments(
  value: unknown,
): asserts value is RecordIdentityCommitments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Canonicalization record identity commitments are invalid');
  }
  const commitments = value as Record<string, unknown>;
  if (
    Object.keys(commitments).sort().join('\0') !==
    [...TRACKED_RECORD_COLLECTIONS].sort().join('\0')
  ) {
    throw new Error('Canonicalization record identity commitments are invalid');
  }
  for (const objectPlural of TRACKED_RECORD_COLLECTIONS) {
    const commitment = commitments[objectPlural] as
      | Record<string, unknown>
      | undefined;
    if (
      !commitment ||
      Object.keys(commitment).sort().join('\0') !==
        ['allowedCreateIdHashes', 'initialIdHashes'].join('\0')
    ) {
      throw new Error(
        'Canonicalization record identity commitments are invalid',
      );
    }
    for (const field of ['initialIdHashes', 'allowedCreateIdHashes']) {
      const hashes = commitment[field];
      if (
        !Array.isArray(hashes) ||
        hashes.some(
          (hash) => typeof hash !== 'string' || !HASH_PATTERN.test(hash),
        ) ||
        stableStringify(hashes) !== stableStringify(sortedUniqueHashes(hashes))
      ) {
        throw new Error(
          'Canonicalization record identity commitments are invalid',
        );
      }
    }
  }
}

export const buildRecordIdentityCommitments = (
  snapshot: CanonicalizationSnapshot,
  mutations: readonly RecordMutation[],
): RecordIdentityCommitments =>
  Object.fromEntries(
    TRACKED_RECORD_COLLECTIONS.map((objectPlural) => {
      const initialIds = new Set(snapshot[objectPlural].map(({ id }) => id));

      return [
        objectPlural,
        {
          initialIdHashes: sortedUniqueHashes(
            [...initialIds].map((id) => recordIdHash(objectPlural, id)),
          ),
          allowedCreateIdHashes: sortedUniqueHashes(
            mutations
              .filter(
                (mutation) =>
                  mutation.objectPlural === objectPlural &&
                  !initialIds.has(mutation.id),
              )
              .map(({ id }) => recordIdHash(objectPlural, id)),
          ),
        },
      ];
    }),
  ) as RecordIdentityCommitments;

const checkpointMatches = (
  checkpoint: CanonicalizationCheckpoint,
  origin: string,
  manifest: ReconciliationManifest,
  expectedFinalManifest: ReconciliationManifest,
): void => {
  assertTrustedManifestShape(checkpoint.manifest);
  assertTrustedManifestShape(checkpoint.expectedFinalManifest);
  assertRecordIdentityCommitments(checkpoint.recordIdentityCommitments);
  assertIdentityCommitmentsBoundToManifests(
    checkpoint.recordIdentityCommitments,
    checkpoint.manifest,
    checkpoint.expectedFinalManifest,
  );
  if (
    checkpoint.schemaVersion !== 2 ||
    checkpoint.origin !== origin ||
    !Array.isArray(checkpoint.completedOperations) ||
    checkpoint.completedOperations.some(
      ({ key, sha256: hash }) => !key || !HASH_PATTERN.test(hash),
    ) ||
    new Set(checkpoint.completedOperations.map(({ key }) => key)).size !==
      checkpoint.completedOperations.length ||
    stableStringify(checkpoint.manifest) !== stableStringify(manifest) ||
    stableStringify(checkpoint.expectedFinalManifest) !==
      stableStringify(expectedFinalManifest)
  ) {
    throw new Error('Canonicalization checkpoint does not match this run');
  }
};

const RECORD_COUNT_FIELDS = [
  ['companies', 'companyRecords', 'companyIdSetHash'],
  ['people', 'personRecords', 'personIdSetHash'],
  ['holdingObservations', 'holdingRecords', 'holdingIdSetHash'],
] as const satisfies ReadonlyArray<
  [
    TrackedRecordCollection,
    keyof ReconciliationManifest,
    keyof ReconciliationManifest,
  ]
>;

const recordSetHash = (ids: Iterable<string>): string =>
  createHash('sha256')
    .update(stableStringify(sortedUniqueHashes(ids)), 'utf8')
    .digest('hex');

export const assertIdentityCommitmentsBoundToManifests = (
  commitments: RecordIdentityCommitments,
  initialManifest: ReconciliationManifest,
  expectedFinalManifest: ReconciliationManifest,
): void => {
  assertRecordIdentityCommitments(commitments);
  assertTrustedManifestShape(initialManifest);
  assertTrustedManifestShape(expectedFinalManifest);
  for (const [
    objectPlural,
    countField,
    idSetHashField,
  ] of RECORD_COUNT_FIELDS) {
    const { initialIdHashes, allowedCreateIdHashes } =
      commitments[objectPlural];
    const initialSet = new Set(initialIdHashes);
    if (
      allowedCreateIdHashes.some((hash) => initialSet.has(hash)) ||
      initialIdHashes.length !== initialManifest[countField] ||
      allowedCreateIdHashes.length !==
        expectedFinalManifest[countField] - initialManifest[countField] ||
      recordSetHash(initialIdHashes) !== initialManifest[idSetHashField] ||
      recordSetHash([...initialIdHashes, ...allowedCreateIdHashes]) !==
        expectedFinalManifest[idSetHashField]
    ) {
      throw new Error(
        'Canonicalization record identity commitments do not match the manifests',
      );
    }
  }
};

export const projectExpectedFinalManifest = (
  snapshot: CanonicalizationSnapshot,
  mutations: readonly RecordMutation[],
  currentManifest: ReconciliationManifest,
): ReconciliationManifest => {
  const projected = structuredClone(currentManifest);
  for (const [
    objectPlural,
    countField,
    idSetHashField,
  ] of RECORD_COUNT_FIELDS) {
    const existingIds = new Set(snapshot[objectPlural].map(({ id }) => id));
    const creationIds = mutations
      .filter(
        (mutation) =>
          mutation.objectPlural === objectPlural &&
          !existingIds.has(mutation.id),
      )
      .map(({ id }) => id);
    projected[countField] = currentManifest[countField] + creationIds.length;
    projected[idSetHashField] = recordSetHash(
      [...existingIds, ...creationIds].map((id) =>
        recordIdHash(objectPlural, id),
      ),
    );
  }

  return projected;
};

const withoutCanonicalRecordCounts = (manifest: ReconciliationManifest) => {
  const copy: Partial<ReconciliationManifest> = { ...manifest };
  for (const [, countField, idSetHashField] of RECORD_COUNT_FIELDS) {
    delete copy[countField];
    delete copy[idSetHashField];
  }

  return copy;
};

const assertResumableRunState = (
  report: ReconciliationReport,
  snapshot: CanonicalizationSnapshot,
  mutations: readonly RecordMutation[],
  trustedManifest: ReconciliationManifest,
  expectedFinalManifest: ReconciliationManifest,
): void => {
  const currentManifest = createReconciliationManifest(report);
  if (
    stableStringify(withoutCanonicalRecordCounts(currentManifest)) !==
    stableStringify(withoutCanonicalRecordCounts(trustedManifest))
  ) {
    throw new Error(
      'Canonicalization source state changed after the trusted dry-run',
    );
  }
  const projected = projectExpectedFinalManifest(
    snapshot,
    mutations,
    currentManifest,
  );
  if (stableStringify(projected) !== stableStringify(expectedFinalManifest)) {
    throw new Error(
      'Canonicalization record counts do not match the checkpointed final state',
    );
  }
};

export const assertRecordIdentityState = (
  snapshot: CanonicalizationSnapshot,
  mutations: readonly RecordMutation[],
  commitments: RecordIdentityCommitments,
): void => {
  assertRecordIdentityCommitments(commitments);
  for (const objectPlural of TRACKED_RECORD_COLLECTIONS) {
    const currentHashes = new Set(
      snapshot[objectPlural].map(({ id }) => recordIdHash(objectPlural, id)),
    );
    const initialHashes = new Set(commitments[objectPlural].initialIdHashes);
    const allowedCreateHashes = new Set(
      commitments[objectPlural].allowedCreateIdHashes,
    );
    const allowedHashes = new Set([...initialHashes, ...allowedCreateHashes]);
    const remainingCreateHashes = new Set(
      mutations
        .filter(
          (mutation) =>
            mutation.objectPlural === objectPlural &&
            !currentHashes.has(recordIdHash(objectPlural, mutation.id)),
        )
        .map(({ id }) => recordIdHash(objectPlural, id)),
    );
    if (
      [...initialHashes].some((hash) => !currentHashes.has(hash)) ||
      [...currentHashes].some((hash) => !allowedHashes.has(hash)) ||
      [...remainingCreateHashes].some(
        (hash) => !allowedCreateHashes.has(hash),
      ) ||
      stableStringify(
        sortedUniqueHashes([...currentHashes, ...remainingCreateHashes]),
      ) !== stableStringify(sortedUniqueHashes(allowedHashes))
    ) {
      throw new Error('Canonicalization record identity state changed');
    }
  }
};

const operationKey = (kind: string, objectName: string, id: string): string =>
  `${kind}:${objectName}:${id}`;

const checkpointOperation = async (
  api: CanonicalizationApi,
  checkpoint: CanonicalizationCheckpoint,
  key: string,
  value: unknown,
): Promise<void> => {
  const valueHash = sha256(value);
  const existing = checkpoint.completedOperations.find(
    (operation) => operation.key === key,
  );
  if (existing && existing.sha256 !== valueHash) {
    throw new Error('Checkpoint operation hash does not match this operation');
  }
  if (!existing) {
    checkpoint.completedOperations.push({ key, sha256: valueHash });
  }
  checkpoint.completedOperations.sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  await api.writeCheckpoint(checkpoint);
};

export const chunkCanonicalizationMutations = (
  mutations: readonly RecordMutation[],
  maxRecords = CANONICALIZATION_BATCH_SIZE,
  maxBytes = CANONICALIZATION_MAX_BATCH_BYTES,
): CrmRecord[][] => {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 100) {
    throw new Error('Canonicalization batch count limit must be 1 through 100');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) {
    throw new Error('Canonicalization batch byte limit is invalid');
  }
  const payloads = mutations
    .map(({ id, data }) => ({ ...data, id }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const batches: CrmRecord[][] = [];
  let batch: CrmRecord[] = [];
  let batchBytes = 2;
  for (const record of payloads) {
    const serialized = JSON.stringify(record);
    if (serialized === undefined) {
      throw new Error('Canonicalization mutation is not JSON serializable');
    }
    const recordBytes = Buffer.byteLength(serialized, 'utf8');
    if (recordBytes + 2 > maxBytes) {
      throw new Error('Canonicalization record exceeds the batch byte limit');
    }
    const nextBytes = batchBytes + recordBytes + (batch.length ? 1 : 0);
    if (batch.length >= maxRecords || nextBytes > maxBytes) {
      batches.push(batch);
      batch = [record];
      batchBytes = recordBytes + 2;
    } else {
      batch.push(record);
      batchBytes = nextBytes;
    }
  }
  if (batch.length) batches.push(batch);

  return batches;
};

const mutationConcurrencyToken = (record: CrmRecord): string => {
  if (
    typeof record.updatedAt !== 'string' ||
    !record.updatedAt.trim() ||
    Number.isNaN(Date.parse(record.updatedAt))
  ) {
    throw new Error(
      'Existing canonicalization mutation is missing a valid concurrency token',
    );
  }

  return record.updatedAt;
};

export const assertMutationConcurrencyTokens = (
  snapshot: CanonicalizationSnapshot,
  mutations: readonly RecordMutation[],
): void => {
  const mutationKeys = new Set<string>();
  for (const mutation of mutations) {
    const mutationKey = `${mutation.objectPlural}\0${mutation.id}`;
    if (mutationKeys.has(mutationKey)) {
      throw new Error(
        'Canonicalization plan contains duplicate mutations for one record',
      );
    }
    mutationKeys.add(mutationKey);
    const existing = snapshot[mutation.objectPlural].find(
      (record) => record.id === mutation.id,
    );
    if (existing) mutationConcurrencyToken(existing);
  }
};

export const runCanonicalization = async (
  api: CanonicalizationApi,
  options: CanonicalizationRunOptions,
): Promise<CanonicalizationRunResult> => {
  const mode = options.mode ?? 'dry-run';
  const origin = new URL(options.origin).origin;
  const expectedOrigin = new URL(options.expectedOrigin).origin;
  if (
    options.origin !== origin ||
    options.expectedOrigin !== expectedOrigin ||
    origin !== expectedOrigin
  ) {
    throw new Error(
      'Canonicalization origin does not match the approved origin',
    );
  }
  if (mode === 'apply' && options.confirmation !== 'CANONICALIZE_CRM_DATA') {
    throw new Error('Apply requires exact CANONICALIZE_CRM_DATA confirmation');
  }
  if (mode === 'apply' && !options.expectedManifest) {
    throw new Error('Apply requires the trusted dry-run manifest');
  }
  if (options.expectedManifest) {
    assertTrustedManifestShape(options.expectedManifest);
  }

  const metadata = await api.listMetadataObjects();
  const snapshot = await loadCanonicalizationSnapshot(api);
  if (options.enforceProductionBaseline ?? true) {
    assertAuditedProductionBaseline(snapshot);
  }
  const metadataPlan = buildMetadataPlan(metadata);
  const dataPlan = buildCanonicalizationPlan(snapshot);
  assertPlanCanApply(dataPlan);
  assertMutationConcurrencyTokens(snapshot, dataPlan.mutations);
  const report = buildReconciliationReport(snapshot);
  const manifest = createReconciliationManifest(report);
  const result: CanonicalizationRunResult = {
    mode,
    metadataRenames: metadataPlan.renames.length,
    metadataCreates: metadataPlan.creates.length,
    plannedRecordMutations: dataPlan.mutations.length,
    unresolved: dataPlan.unresolved.length,
    manifest,
    reconciliation: report,
  };
  if (mode === 'dry-run') return result;

  const priorCheckpoint = await api.readCheckpoint();
  const expectedFinalManifest = projectExpectedFinalManifest(
    snapshot,
    dataPlan.mutations,
    manifest,
  );
  const recordIdentityCommitments = priorCheckpoint
    ? priorCheckpoint.recordIdentityCommitments
    : buildRecordIdentityCommitments(snapshot, dataPlan.mutations);
  if (priorCheckpoint) {
    checkpointMatches(
      priorCheckpoint,
      origin,
      options.expectedManifest!,
      expectedFinalManifest,
    );
    assertResumableRunState(
      report,
      snapshot,
      dataPlan.mutations,
      options.expectedManifest!,
      priorCheckpoint.expectedFinalManifest,
    );
    assertRecordIdentityState(
      snapshot,
      dataPlan.mutations,
      recordIdentityCommitments,
    );
  } else {
    assertReconciliationManifest(report, options.expectedManifest!);
  }
  const checkpoint: CanonicalizationCheckpoint = priorCheckpoint ?? {
    schemaVersion: 2,
    origin,
    manifest: options.expectedManifest!,
    expectedFinalManifest,
    recordIdentityCommitments,
    status: 'metadata',
    completedOperations: [],
  };
  checkpointMatches(
    checkpoint,
    origin,
    options.expectedManifest!,
    expectedFinalManifest,
  );
  const completed = new Map(
    checkpoint.completedOperations.map((operation) => [
      operation.key,
      operation.sha256,
    ]),
  );
  await api.writeCheckpoint(checkpoint);

  for (const rename of metadataPlan.renames) {
    const key = operationKey('rename', rename.objectName, rename.fieldId);
    if (completed.has(key)) {
      throw new Error(
        'Checkpoint claims an unfinished metadata rename is complete',
      );
    }
    await api.renameMetadataField(
      rename.fieldId,
      rename.targetName,
      rename.targetLabel,
    );
    await checkpointOperation(api, checkpoint, key, rename);
  }
  for (const create of metadataPlan.creates) {
    const key = operationKey('create-field', create.objectName, create.name);
    if (completed.has(key)) {
      throw new Error(
        'Checkpoint claims an unfinished metadata create is complete',
      );
    }
    await api.createMetadataField(create);
    await checkpointOperation(api, checkpoint, key, create);
  }

  const refreshedMetadata = await api.listMetadataObjects();
  assertManagedMetadataConverged(refreshedMetadata);

  const postMetadataSnapshot = await loadCanonicalizationSnapshot(api);
  const postMetadataReport = buildReconciliationReport(postMetadataSnapshot);
  const postMetadataPlan = buildCanonicalizationPlan(postMetadataSnapshot);
  assertPlanCanApply(postMetadataPlan);
  assertMutationConcurrencyTokens(
    postMetadataSnapshot,
    postMetadataPlan.mutations,
  );
  assertResumableRunState(
    postMetadataReport,
    postMetadataSnapshot,
    postMetadataPlan.mutations,
    options.expectedManifest!,
    checkpoint.expectedFinalManifest,
  );
  assertRecordIdentityState(
    postMetadataSnapshot,
    postMetadataPlan.mutations,
    checkpoint.recordIdentityCommitments,
  );
  checkpoint.status = 'records';
  await api.writeCheckpoint(checkpoint);

  const workingSnapshot = structuredClone(postMetadataSnapshot);
  const completedObjectWrites = new Set<keyof CanonicalizationSnapshot>();
  let workingPlan = postMetadataPlan;
  while (workingPlan.mutations.length) {
    const objectPlural = SNAPSHOT_COLLECTIONS.find((candidate) =>
      workingPlan.mutations.some(
        (mutation) => mutation.objectPlural === candidate,
      ),
    );
    if (!objectPlural || completedObjectWrites.has(objectPlural)) {
      throw new Error('Canonicalization record writes did not converge');
    }
    completedObjectWrites.add(objectPlural);
    const objectMutations = workingPlan.mutations.filter(
      (mutation) => mutation.objectPlural === objectPlural,
    );
    const existingById = new Map(
      workingSnapshot[objectPlural].map((record) => [record.id, record]),
    );
    const existingMutations = objectMutations.filter((mutation) =>
      existingById.has(mutation.id),
    );
    const newMutations = objectMutations.filter(
      (mutation) => !existingById.has(mutation.id),
    );
    for (const mutation of existingMutations) {
      const expectedUpdatedAt = mutationConcurrencyToken(
        existingById.get(mutation.id)!,
      );
      const operation = {
        id: mutation.id,
        expectedUpdatedAt,
        data: mutation.data,
      };
      const operationHash = sha256(operation);
      const key = operationKey(
        'conditional-patch',
        objectPlural,
        operationHash,
      );
      const completedHash = completed.get(key);
      if (completedHash) {
        throw new Error(
          completedHash === operationHash
            ? 'Checkpoint claims an unfinished conditional update is complete'
            : 'Checkpoint conditional update hash does not match the fresh plan',
        );
      }
      await api.conditionalPatchOne(
        objectPlural,
        mutation.id,
        expectedUpdatedAt,
        mutation.data,
      );
      await checkpointOperation(api, checkpoint, key, operation);
      completed.set(key, operationHash);
    }

    const batches = chunkCanonicalizationMutations(newMutations);
    for (const batch of batches) {
      const batchHash = sha256(batch);
      const key = operationKey('batch', objectPlural, batchHash);
      const completedHash = completed.get(key);
      if (completedHash && completedHash !== batchHash) {
        throw new Error('Checkpoint batch hash does not match the fresh plan');
      }
      await api.upsertBatch(objectPlural, batch);
      await checkpointOperation(api, checkpoint, key, batch);
      completed.set(key, batchHash);
    }

    workingSnapshot[objectPlural] = await api.listAll(objectPlural);
    workingPlan = buildCanonicalizationPlan(workingSnapshot);
    assertPlanCanApply(workingPlan);
    if (
      workingPlan.mutations.some(
        (mutation) => mutation.objectPlural === objectPlural,
      )
    ) {
      throw new Error(
        `Canonicalization writes did not converge for ${objectPlural}`,
      );
    }
  }

  checkpoint.status = 'verifying';
  await api.writeCheckpoint(checkpoint);
  const finalSnapshot = await loadCanonicalizationSnapshot(api);
  assertRecordIdentityState(
    finalSnapshot,
    [],
    checkpoint.recordIdentityCommitments,
  );
  const finalReport = assertCanonicalizationComplete(finalSnapshot);
  assertReconciliationManifest(finalReport, checkpoint.expectedFinalManifest);
  checkpoint.status = 'complete';
  await api.writeCheckpoint(checkpoint);

  return {
    ...result,
    manifest: createReconciliationManifest(finalReport),
    reconciliation: finalReport,
  };
};
