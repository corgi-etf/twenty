import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunkCanonicalizationMutations,
  loadCanonicalizationSnapshot,
  runCanonicalization,
  type CanonicalizationApi,
  type CanonicalizationCheckpoint,
} from '../src/execution.ts';
import type { MetadataCreate, MetadataObject } from '../src/metadata.ts';
import type { CanonicalizationSnapshot, CrmRecord } from '../src/planner.ts';

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
        settings: { relationTargetObjectMetadataId: object.id },
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
      else this.snapshot[objectPlural].push(structuredClone(incoming));
    }
    this.writes.push(`batch:${String(objectPlural)}:${records.length}`);
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

test('apply refetches metadata, writes one record, and proves zero work', async () => {
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
  const dryRun = await runCanonicalization(api, options);

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.ok(api.writes.some((write) => write.startsWith('create-field:')));
  assert.ok(api.writes.includes('batch:people:1'));
  assert.equal(api.checkpoint?.status, 'complete');
});

test('response loss resumes from fresh state without replaying persisted data', async () => {
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
  const persistedBatches = api.writes.filter((write) =>
    write.startsWith('batch:people:'),
  ).length;

  const result = await runCanonicalization(api, {
    ...options,
    mode: 'apply',
    confirmation: 'CANONICALIZE_CRM_DATA',
    expectedManifest: dryRun.manifest,
  });

  assert.equal(result.reconciliation.remainingMutations, 0);
  assert.equal(
    api.writes.filter((write) => write.startsWith('batch:people:')).length,
    persistedBatches,
  );
});

test('a lost batch request can be replayed safely from the fresh plan', async () => {
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
    api.writes.filter((write) => write.startsWith('batch:people:')).length,
    1,
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
