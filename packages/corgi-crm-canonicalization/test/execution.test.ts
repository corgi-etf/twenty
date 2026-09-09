import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertMutationConcurrencyTokens,
  assertRecordIdentityState,
  buildRecordIdentityCommitments,
  chunkCanonicalizationMutations,
  loadCanonicalizationSnapshot,
  runCanonicalization,
  type CanonicalizationApi,
  type CanonicalizationCheckpoint,
} from '../src/execution.ts';
import type { MetadataCreate, MetadataObject } from '../src/metadata.ts';
import {
  buildCanonicalizationPlan,
  type CanonicalizationSnapshot,
  type CrmRecord,
} from '../src/planner.ts';

const emptySnapshot = (): CanonicalizationSnapshot => ({
  companies: [],
  people: [],
  sourceRecords: [],
  importReviewItems: [],
  holdingObservations: [],
  tasks: [],
  taskTargets: [],
  wholesalers: [],
  leadAssignments: [],
  outreachActivities: [],
  archivedOutreachActivities: [],
});

const emptyMetadata = (): MetadataObject[] =>
  [
    'company',
    'person',
    'sourceRecord',
    'importReviewItem',
    'holdingObservation',
    'task',
    'taskTarget',
    'wholesaler',
    'leadAssignment',
    'outreachActivity',
    'archivedOutreachActivity',
  ].map((nameSingular) => ({
    id: `${nameSingular}-object`,
    nameSingular,
    fields: [],
  }));

class MemoryApi implements CanonicalizationApi {
  readonly snapshot: CanonicalizationSnapshot;
  metadata = emptyMetadata();
  writes: string[] = [];
  checkpoint?: CanonicalizationCheckpoint;
  concurrentReads = 0;
  maximumConcurrentReads = 0;
  failAfterNextPersist = false;
  failAfterNextBatchPersist = false;
  failBeforeNextPersist = false;

  constructor(snapshot: CanonicalizationSnapshot) {
    this.snapshot = snapshot;
  }

  async listMetadataObjects(): Promise<MetadataObject[]> {
    return structuredClone(this.metadata);
  }

  async listAll(
    objectPlural: keyof CanonicalizationSnapshot,
  ): Promise<CrmRecord[]> {
    this.concurrentReads += 1;
    this.maximumConcurrentReads = Math.max(
      this.maximumConcurrentReads,
      this.concurrentReads,
    );
    await Promise.resolve();
    this.concurrentReads -= 1;
    return structuredClone(this.snapshot[objectPlural]);
  }

  async renameMetadataField(
    fieldId: string,
    name: string,
    label: string,
  ): Promise<void> {
    const field = this.metadata
      .flatMap(({ fields }) => fields)
      .find(({ id }) => id === fieldId);
    assert.ok(field);
    field.name = name;
    field.label = label;
    this.writes.push(`rename:${name}`);
  }

  async createMetadataField(input: MetadataCreate): Promise<void> {
    const object = this.metadata.find(
      ({ id }) => id === input.objectMetadataId,
    );
    assert.ok(object);
    object.fields.push({
      id: `${object.id}-${input.name}`,
      name: input.name,
      label: input.label,
      type: input.type,
      settings: input.relationTargetObjectMetadataId
        ? {
            relationTargetObjectMetadataId:
              input.relationTargetObjectMetadataId,
            relationType: input.relationType,
          }
        : undefined,
    });
    if (input.relationTargetObjectMetadataId && input.targetFieldLabel) {
      const target = this.metadata.find(
        ({ id }) => id === input.relationTargetObjectMetadataId,
      );
      assert.ok(target);
      target.fields.push({
        id: `${target.id}-${input.name}-inverse`,
        name: `${input.name}Inverse`,
        label: input.targetFieldLabel,
        type: 'RELATION',
        settings: {
          relationTargetObjectMetadataId: object.id,
          relationType: 'ONE_TO_MANY',
        },
      });
    }
    this.writes.push(`create-field:${input.name}`);
  }

  async upsertBatch(
    objectPlural: keyof CanonicalizationSnapshot,
    records: CrmRecord[],
  ): Promise<void> {
    if (this.failBeforeNextPersist) {
      this.failBeforeNextPersist = false;
      throw new Error('simulated request loss');
    }
    for (const incoming of records) {
      const record = this.snapshot[objectPlural].find(
        (candidate) => candidate.id === incoming.id,
      );
      if (record) Object.assign(record, incoming);
      else {
        this.snapshot[objectPlural].push({
          ...structuredClone(incoming),
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }
    }
    this.writes.push(`batch:${String(objectPlural)}:${records.length}`);
    if (this.failAfterNextPersist || this.failAfterNextBatchPersist) {
      this.failAfterNextPersist = false;
      this.failAfterNextBatchPersist = false;
      throw new Error('simulated response loss');
    }
  }

  async conditionalPatchOne(
    objectPlural: keyof CanonicalizationSnapshot,
    id: string,
    expectedUpdatedAt: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (this.failBeforeNextPersist) {
      this.failBeforeNextPersist = false;
      throw new Error('simulated request loss');
    }
    const record = this.snapshot[objectPlural].find(
      (candidate) => candidate.id === id,
    );
    if (!record || record.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Canonicalization concurrency conflict for ${objectPlural}`,
      );
    }
    Object.assign(record, data, {
      updatedAt: new Date(Date.parse(expectedUpdatedAt) + 1).toISOString(),
    });
    this.writes.push(`conditional:${String(objectPlural)}:1`);
    if (this.failAfterNextPersist) {
      this.failAfterNextPersist = false;
      throw new Error('simulated response loss');
    }
  }

  async readCheckpoint(): Promise<CanonicalizationCheckpoint | undefined> {
    return structuredClone(this.checkpoint);
  }

  async writeCheckpoint(checkpoint: CanonicalizationCheckpoint): Promise<void> {
    this.checkpoint = structuredClone(checkpoint);
  }
}

const options = {
  origin: 'https://crm.corgiinvest.com',
  expectedOrigin: 'https://crm.corgiinvest.com',
  enforceProductionBaseline: false,
} as const;

test('dry-run is default, serial, aggregate-only, and performs no writes', async () => {
  const api = new MemoryApi(emptySnapshot());
  const result = await runCanonicalization(api, options);

  assert.equal(result.mode, 'dry-run');
  assert.ok(result.metadataCreates > 0);
  assert.equal(api.maximumConcurrentReads, 1);
  assert.deepEqual(api.writes, []);
  assert.match(result.manifest.rowCoverageHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('corgi.insure'), false);
});

test('dry-run reports every unresolved record while apply remains fail-closed', async () => {
  const input = emptySnapshot();
  input.companies.push({
    id: 'company-1',
    name: 'Acme',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  input.sourceRecords.push(
    {
      id: 'private-source-one',
      companyId: 'company-1',
      sourceFile: 'private-damien.csv',
      sourceSheet: 'Leads',
      sourceRow: 1,
      rawData: JSON.stringify({
        'Unsupported Field': 'damien@corgi.insure',
      }),
    },
    {
      id: 'private-source-two',
      companyId: 'company-1',
      sourceFile: 'private-addresses.csv',
      sourceSheet: 'Leads',
      sourceRow: 2,
      rawData: JSON.stringify({
        'Unsupported Field': 'Damien Wiese | +1 312-555-0198 | 1 Main St',
      }),
    },
  );
  const api = new MemoryApi(input);
  const unresolvedRowKeys = buildCanonicalizationPlan(input).unresolved.map(
    ({ rowKey }) => rowKey,
  );

  const dryRun = await runCanonicalization(api, options);
  const serialized = JSON.stringify(dryRun);

  assert.ok(dryRun.unresolved > 0);
  assert.deepEqual(dryRun.reconciliation.unresolvedSchemaDiagnostics, [
    {
      code: 'UNHANDLED_RAW_FIELD',
      normalizedRawKey: 'unsupported field',
      canonicalTarget: null,
      canonicalField: null,
      count: 2,
    },
  ]);
  for (const forbidden of [
    'damien@corgi.insure',
    'Damien Wiese',
    '+1 312-555-0198',
    '1 Main St',
    'private-damien.csv',
    'private-addresses.csv',
    ...unresolvedRowKeys,
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(api.writes, []);
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /unresolved/i,
  );
  assert.deepEqual(api.writes, []);
});

test('apply requires exact origin, confirmation, and trusted manifest', async () => {
  const api = new MemoryApi(emptySnapshot());
  const dryRun = await runCanonicalization(api, options);

  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      origin: 'https://lookalike.example',
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /origin/i,
  );
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'wrong',
      expectedManifest: dryRun.manifest,
    }),
    /confirmation/i,
  );
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
    }),
    /manifest/i,
  );
  assert.deepEqual(api.writes, []);
});

test('changed canonical record counts reject before checkpoint or metadata writes', async () => {
  const api = new MemoryApi(emptySnapshot());
  const dryRun = await runCanonicalization(api, options);
  api.snapshot.companies.push({ id: 'new-company', name: 'New Company' });

  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /trusted dry-run manifest/,
  );
  assert.deepEqual(api.writes, []);
  assert.equal(api.checkpoint, undefined);
});

test('a same-count canonical ID swap rejects before checkpoint or metadata writes', async () => {
  const input = emptySnapshot();
  input.companies.push({ id: 'company-1', name: 'Original Company' });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);
  api.snapshot.companies = [{ id: 'company-2', name: 'Replacement Company' }];

  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /trusted dry-run manifest/,
  );
  assert.deepEqual(api.writes, []);
  assert.equal(api.checkpoint, undefined);
});

test('apply refetches metadata, writes one record, and proves zero work', async () => {
  const input = emptySnapshot();
  input.people.push({
    id: 'person-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
    legacyEmail: 'person@example.test',
  });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.ok(api.writes.some((write) => write.startsWith('create-field:')));
  assert.ok(api.writes.includes('conditional:people:1'));
  assert.equal(api.checkpoint?.status, 'complete');
});

test('an existing mutation without updatedAt fails before metadata or checkpoint writes', async () => {
  const input = emptySnapshot();
  input.people.push({
    id: 'person-1',
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
    legacyEmail: 'person@example.test',
  });
  const api = new MemoryApi(input);

  await assert.rejects(
    runCanonicalization(api, options),
    /missing a valid concurrency token/i,
  );
  assert.deepEqual(api.writes, []);
  assert.equal(api.checkpoint, undefined);
});

test('response loss resumes from fresh state without replaying persisted data', async () => {
  const input = emptySnapshot();
  input.people.push({
    id: 'person-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
    legacyEmail: 'person@example.test',
  });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);
  api.failAfterNextPersist = true;
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /response loss/,
  );
  const persistedUpdates = api.writes.filter((write) =>
    write.startsWith('conditional:people:'),
  ).length;

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.equal(
    api.writes.filter((write) => write.startsWith('conditional:people:'))
      .length,
    persistedUpdates,
  );
});

test('a lost conditional request can be replayed safely from the fresh plan', async () => {
  const input = emptySnapshot();
  input.people.push({
    id: 'person-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
    legacyEmail: 'person@example.test',
  });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);
  api.failBeforeNextPersist = true;
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /request loss/,
  );

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.equal(
    api.writes.filter((write) => write.startsWith('conditional:people:'))
      .length,
    1,
  );
});

test('a persisted new holding resumes against checkpointed final counts', async () => {
  const input = emptySnapshot();
  input.companies.push({
    id: 'company-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Acme Advisors',
  });
  input.importReviewItems.push({
    id: 'review-holding-1',
    reviewStatus: 'accepted',
    candidateCompanyId: 'company-1',
    sourceFile: 'Product A.csv',
    sourceRow: 1,
    rawData: JSON.stringify({
      'Filer Name': 'Acme Advisors',
      'Shares Held': '100',
      'Market Value': '5000',
      'Source Date': '2026-06-30',
    }),
  });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);
  assert.equal(dryRun.manifest.holdingRecords, 0);

  api.failAfterNextBatchPersist = true;
  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /response loss/,
  );
  assert.equal(api.snapshot.holdingObservations.length, 1);
  assert.equal(api.checkpoint?.expectedFinalManifest.holdingRecords, 1);
  assert.deepEqual(
    buildCanonicalizationPlan(api.snapshot).mutations.filter(
      ({ objectPlural }) => objectPlural === 'holdingObservations',
    ),
    [],
  );

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.manifest.holdingRecords, 1);
  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.equal(
    api.writes.filter((write) => write === 'batch:holdingObservations:1')
      .length,
    1,
  );
});

test('a concurrent user edit aborts before the imported patch can overwrite it', async () => {
  const input = emptySnapshot();
  input.people.push({
    id: 'person-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    jobTitle: 'Original title',
    emails: { primaryEmail: '', additionalEmails: [] },
    phones: {
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      primaryPhoneCallingCode: '',
      additionalPhones: [],
    },
    legacyEmail: 'person@example.test',
  });
  const api = new MemoryApi(input);
  const dryRun = await runCanonicalization(api, options);
  const originalConditionalPatch = api.conditionalPatchOne.bind(api);
  api.conditionalPatchOne = async (...args) => {
    const person = api.snapshot.people[0];
    person.jobTitle = 'User edit';
    person.updatedAt = '2026-01-01T00:00:01.000Z';
    await originalConditionalPatch(...args);
  };

  await assert.rejects(
    runCanonicalization(api, {
      ...options,
      mode: 'apply',
      confirmation: 'CANONICALIZE_CRM_DATA',
      expectedManifest: dryRun.manifest,
    }),
    /concurrency conflict/i,
  );

  assert.equal(api.snapshot.people[0].jobTitle, 'User edit');
  assert.deepEqual(api.snapshot.people[0].emails, {
    primaryEmail: '',
    additionalEmails: [],
  });
  assert.equal(
    api.checkpoint?.completedOperations.some(({ key }) =>
      key.startsWith('conditional-patch:people:'),
    ),
    false,
  );
});

test('snapshot loading never fans out collection reads', async () => {
  const api = new MemoryApi(emptySnapshot());
  await loadCanonicalizationSnapshot(api);
  assert.equal(api.maximumConcurrentReads, 1);
});

test('record batches obey count and exact UTF-8 body limits', () => {
  const mutations = Array.from({ length: 205 }, (_, index) => ({
    objectPlural: 'people',
    id: `person-${String(index).padStart(3, '0')}`,
    data: { bio: 'é'.repeat(12) },
  }));
  const byCount = chunkCanonicalizationMutations(mutations);
  assert.deepEqual(
    byCount.map(({ length }) => length),
    [100, 100, 5],
  );

  const oneRecordBytes = Buffer.byteLength(
    JSON.stringify([{ id: 'person-000', bio: 'é'.repeat(12) }]),
    'utf8',
  );
  const byBytes = chunkCanonicalizationMutations(
    mutations.slice(0, 2),
    100,
    oneRecordBytes,
  );
  assert.deepEqual(
    byBytes.map(({ length }) => length),
    [1, 1],
  );
  assert.throws(
    () =>
      chunkCanonicalizationMutations(
        mutations.slice(0, 1),
        100,
        oneRecordBytes - 1,
      ),
    /exceeds.*byte limit/i,
  );
});

test('a plan cannot patch the same record twice with one concurrency token', () => {
  const snapshot = emptySnapshot();
  snapshot.people.push({
    id: 'person-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.throws(
    () =>
      assertMutationConcurrencyTokens(snapshot, [
        { objectPlural: 'people', id: 'person-1', data: { bio: 'One' } },
        { objectPlural: 'people', id: 'person-1', data: { bio: 'Two' } },
      ]),
    /duplicate mutations/i,
  );
});

test('identity commitments reject a planned create offset by an initial deletion', () => {
  const initial = emptySnapshot();
  initial.companies.push({ id: 'company-initial' });
  const plannedCreate = {
    objectPlural: 'companies',
    id: 'company-planned',
    data: { name: 'Planned Company' },
  } as const;
  const commitments = buildRecordIdentityCommitments(initial, [plannedCreate]);
  const completedCreate = emptySnapshot();
  completedCreate.companies.push({ id: 'company-planned' });

  assert.throws(
    () => assertRecordIdentityState(completedCreate, [], commitments),
    /identity state changed/i,
  );

  completedCreate.companies.push({ id: 'company-initial' });
  assert.doesNotThrow(() =>
    assertRecordIdentityState(completedCreate, [], commitments),
  );
});
