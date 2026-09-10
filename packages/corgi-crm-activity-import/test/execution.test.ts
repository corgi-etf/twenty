import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  runActivityImport,
  type ActivityImportApi,
  type ActivityImportCheckpoint,
} from '../src/execution.ts';
import {
  deterministicActivityId,
  type ActivityImportManifest,
  type OutreachActivityRecord,
} from '../src/importer.ts';

const uuid = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const identities = { Grace: uuid('1'), Nash: uuid('3') };
const identityArtifact = {
  workspaceMemberIds: identities,
  aggregateIdentityHash: createHash('sha256')
    .update(
      `Grace=${identities.Grace}\nNash=${identities.Nash}`,
    )
    .digest('hex'),
};
const source = Buffer.from('Acme,,,,,,,Reached them,,\nBeta,,,,,,,,,\n');
const csvOptions = {
  sourceFormat: 'legacy-nash-outreach-v1' as const,
  ownerLabel: 'Nash' as const,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  provenanceSha256: createHash('sha256').update(source).digest('hex'),
  expectedRows: 2,
  activityDate: '2026-09-09',
  timeZone: 'America/Chicago',
  importId: 'nash-calls-2026-09-09',
};

class FakeApi implements ActivityImportApi {
  companies = [
    { id: uuid('4'), name: 'Acme' },
    { id: uuid('5'), name: 'Beta' },
  ];
  wholesalers = [{ id: uuid('6'), workspaceMemberId: identities.Nash }];
  people = [];
  activities: OutreachActivityRecord[] = [];
  checkpoints: ActivityImportCheckpoint[] = [];
  creates: OutreachActivityRecord[] = [];
  failOnCreateNumber: number | undefined;

  async listCompanies() {
    return this.companies;
  }
  async listWholesalers() {
    return this.wholesalers;
  }
  async listPeople() {
    return this.people;
  }
  async listOutreachActivities() {
    return this.activities;
  }
  async createOutreachActivity(record: OutreachActivityRecord) {
    if (this.creates.length + 1 === this.failOnCreateNumber) {
      throw new Error('injected create failure');
    }
    this.creates.push(record);
    this.activities.push(record);
  }
  async readCheckpoint() {
    return this.checkpoints[this.checkpoints.length - 1];
  }
  async writeCheckpoint(checkpoint: ActivityImportCheckpoint) {
    this.checkpoints.push(structuredClone(checkpoint));
  }
}

const run = (
  api: FakeApi,
  mode: 'dry-run' | 'apply',
  expectedManifest?: ActivityImportManifest,
) =>
  runActivityImport(api, {
    source,
    csvOptions,
    identityArtifact,
    mode,
    confirmation:
      mode === 'apply' ? 'IMPORT_CRM_OUTREACH_ACTIVITIES' : undefined,
    expectedManifest,
  });

test('dry-run creates no CRM records and emits a PII-free approved plan', async () => {
  const api = new FakeApi();
  const result = await run(api, 'dry-run');

  assert.equal(result.status, 'planned');
  assert.equal(result.plannedCount, 2);
  assert.equal(result.createdCount, 0);
  assert.equal(api.creates.length, 0);
  assert.equal(api.checkpoints[api.checkpoints.length - 1]?.status, 'planned');
  const serialized = JSON.stringify({ result, checkpoint: api.checkpoints });
  assert.doesNotMatch(serialized, /Acme|Beta|Reached/);
});

test('apply requires confirmation and the exact dry-run manifest', async () => {
  const api = new FakeApi();
  const dryRun = await run(api, 'dry-run');
  api.checkpoints = [];

  await assert.rejects(
    runActivityImport(api, {
      source,
      csvOptions,
      identityArtifact,
      mode: 'apply',
      confirmation: 'wrong',
      expectedManifest: dryRun.manifest,
    }),
    /confirmation is invalid/,
  );
  await assert.rejects(
    runActivityImport(api, {
      source,
      csvOptions,
      identityArtifact,
      mode: 'apply',
      confirmation: 'IMPORT_CRM_OUTREACH_ACTIVITIES',
      expectedManifest: { ...dryRun.manifest, planHash: '0'.repeat(64) },
    }),
    /approved dry-run manifest/,
  );
  assert.equal(api.creates.length, 0);
});

test('apply creates every missing record, checkpoints each operation, and verifies', async () => {
  const api = new FakeApi();
  const dryRun = await run(api, 'dry-run');
  api.checkpoints = [];
  const result = await run(api, 'apply', dryRun.manifest);

  assert.equal(result.status, 'complete');
  assert.equal(result.createdCount, 2);
  assert.equal(result.alreadyPresentCount, 0);
  assert.equal(api.creates.length, 2);
  assert.deepEqual(
    api.creates.map(({ id }) => id),
    [
      deterministicActivityId(csvOptions.importId, 1),
      deterministicActivityId(csvOptions.importId, 2),
    ],
  );
  assert.deepEqual(
    api.checkpoints.map(({ status }) => status),
    ['applying', 'applying', 'applying', 'verifying', 'complete'],
  );
  assert.equal(
    api.checkpoints[api.checkpoints.length - 1]?.completedOperationHashes
      .length,
    2,
  );
});

test('an exact rerun is idempotent and creates nothing', async () => {
  const api = new FakeApi();
  const dryRun = await run(api, 'dry-run');
  api.checkpoints = [];
  await run(api, 'apply', dryRun.manifest);
  api.creates = [];
  const rerun = await run(api, 'apply', dryRun.manifest);

  assert.equal(rerun.createdCount, 0);
  assert.equal(rerun.alreadyPresentCount, 2);
  assert.equal(api.creates.length, 0);
});

test('fails before mutation when any deterministic record collides', async () => {
  const api = new FakeApi();
  const dryRun = await run(api, 'dry-run');
  api.checkpoints = [];
  api.activities.push({
    id: deterministicActivityId(csvOptions.importId, 2),
    name: 'foreign record',
  });

  await assert.rejects(run(api, 'apply', dryRun.manifest), /ID collision/);
  assert.equal(api.creates.length, 0);
});

test('a failure after one create leaves a PII-free resumable checkpoint', async () => {
  const api = new FakeApi();
  const dryRun = await run(api, 'dry-run');
  api.checkpoints = [];
  api.failOnCreateNumber = 2;

  await assert.rejects(run(api, 'apply', dryRun.manifest), /injected create/);

  assert.equal(api.creates.length, 1);
  const checkpoint = api.checkpoints[api.checkpoints.length - 1];
  assert.equal(checkpoint?.status, 'applying');
  assert.equal(checkpoint?.completedOperationHashes.length, 1);
  assert.doesNotMatch(
    JSON.stringify(checkpoint),
    /Acme|Beta|Reached|companyName|notes/,
  );
});
