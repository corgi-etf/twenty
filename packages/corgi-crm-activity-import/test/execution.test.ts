import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  runActivityImport,
  runActivityImportCompanyCreation,
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
  companyCreates: { name: string }[] = [];
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
  async createCompany(company: { name: string }) {
    this.companyCreates.push(company);
    this.companies.push({ id: uuid('7'), name: company.name });
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


const EN_DASH_FIRM = 'Holistic Planning \u2013 Kansas City';
const PIPE_FIRM = 'WEALTH | KC';
const AMPERSAND_FIRM = 'Atwood & Palmer, Inc.';
// The ampersand firm carries a comma, so it has to arrive CSV-quoted.
const trickySource = Buffer.from(
  `${EN_DASH_FIRM},,,,,,,,,\n${PIPE_FIRM},,,,,,,,,\n"${AMPERSAND_FIRM}",,,,,,,,,\n`,
  'utf8',
);
const trickyCsvOptions = {
  ...csvOptions,
  sourceSha256: createHash('sha256').update(trickySource).digest('hex'),
  provenanceSha256: createHash('sha256').update(trickySource).digest('hex'),
  expectedRows: 3,
};

const createCompanies = (
  api: FakeApi,
  mode: 'dry-run' | 'apply',
  overrides: {
    source?: Buffer;
    csvOptions?: typeof csvOptions;
    confirmation?: string;
  } = {},
) =>
  runActivityImportCompanyCreation(api, {
    source: overrides.source ?? source,
    csvOptions: overrides.csvOptions ?? csvOptions,
    mode,
    confirmation:
      'confirmation' in overrides
        ? overrides.confirmation
        : mode === 'apply'
          ? 'CREATE_CRM_IMPORT_COMPANIES'
          : undefined,
  });

test('company creation is off by default and leaves the import byte-for-byte unchanged', async () => {
  const withoutCreation = new FakeApi();
  const withCreation = new FakeApi();

  const baseline = await run(withoutCreation, 'dry-run');
  const unchanged = await run(withCreation, 'dry-run');

  // A createCompany-capable API must not change what a plain import does.
  assert.deepEqual(unchanged, baseline);
  assert.equal(withCreation.companyCreates.length, 0);
  assert.equal(withoutCreation.companyCreates.length, 0);
});

test('company creation creates only the zero-match firms and verifies the result', async () => {
  const api = new FakeApi();
  api.companies = [{ id: uuid('4'), name: 'Acme' }];

  const result = await createCompanies(api, 'apply');

  assert.equal(result.operation, 'create-companies');
  assert.equal(result.mode, 'apply');
  assert.equal(result.createdCount, 1);
  assert.equal(result.alreadyPresentCount, 1);
  assert.deepEqual(result.plannedNames, ['Beta']);
  assert.deepEqual(
    api.companyCreates.map(({ name }) => name),
    ['Beta'],
  );
});

test('company creation refuses a two-or-more match and creates nothing', async () => {
  const api = new FakeApi();
  api.companies = [
    { id: uuid('4'), name: 'Acme' },
    { id: uuid('5'), name: 'Acme' },
    { id: uuid('6'), name: 'Beta' },
  ];

  await assert.rejects(
    createCompanies(api, 'apply'),
    /matched 2 companies[\s\S]*resolve the duplicate/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('company creation requires its own confirmation string', async () => {
  const api = new FakeApi();
  api.companies = [];

  await assert.rejects(
    createCompanies(api, 'apply', { confirmation: 'IMPORT_CRM_OUTREACH_ACTIVITIES' }),
    /company creation confirmation is invalid/,
  );
  await assert.rejects(
    createCompanies(api, 'apply', { confirmation: undefined }),
    /company creation confirmation is invalid/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('company creation fails closed when the API cannot create companies', async () => {
  const api = new FakeApi();
  api.companies = [];
  const withoutCreate: ActivityImportApi = {
    listCompanies: () => api.listCompanies(),
    listWholesalers: () => api.listWholesalers(),
    listPeople: () => api.listPeople(),
    listOutreachActivities: () => api.listOutreachActivities(),
    createOutreachActivity: (record) => api.createOutreachActivity(record),
    readCheckpoint: () => api.readCheckpoint(),
    writeCheckpoint: (checkpoint) => api.writeCheckpoint(checkpoint),
  };

  await assert.rejects(
    runActivityImportCompanyCreation(withoutCreate, {
      source,
      csvOptions,
      mode: 'apply',
      confirmation: 'CREATE_CRM_IMPORT_COMPANIES',
    }),
    /cannot create companies/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('company creation dry-run reports what it would create and creates nothing', async () => {
  const api = new FakeApi();
  api.companies = [{ id: uuid('4'), name: 'Acme' }];

  const result = await createCompanies(api, 'dry-run');

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.createdCount, 0);
  assert.equal(result.plannedCount, 1);
  assert.deepEqual(result.plannedNames, ['Beta']);
  assert.equal(result.alreadyPresentCount, 1);
  assert.equal(api.companyCreates.length, 0);
  assert.equal(api.companies.length, 1);
});

test('company creation dry-run cannot carry an apply approval', async () => {
  const api = new FakeApi();

  await assert.rejects(
    createCompanies(api, 'dry-run', {
      confirmation: 'CREATE_CRM_IMPORT_COMPANIES',
    }),
    /cannot include apply approval/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('a second company creation run creates nothing', async () => {
  const api = new FakeApi();
  api.companies = [];

  const first = await createCompanies(api, 'apply');
  api.companyCreates = [];
  const rerun = await createCompanies(api, 'apply');

  assert.equal(first.createdCount, 2);
  assert.equal(rerun.createdCount, 0);
  assert.equal(rerun.plannedCount, 0);
  assert.equal(rerun.alreadyPresentCount, 2);
  assert.equal(api.companyCreates.length, 0);
});

test('company creation stores an en dash, pipe, and ampersand byte-for-byte', async () => {
  const api = new FakeApi();
  api.companies = [];

  const result = await createCompanies(api, 'apply', {
    source: trickySource,
    csvOptions: trickyCsvOptions,
  });

  assert.equal(result.createdCount, 3);
  assert.deepEqual(
    api.companyCreates.map(({ name }) => name),
    [EN_DASH_FIRM, PIPE_FIRM, AMPERSAND_FIRM],
  );
  assert.equal(api.companyCreates[0]?.name.includes('\u2013'), true);
  assert.equal(api.companyCreates[0]?.name.includes('-'), false);

  // The whole point of byte preservation: the next run must match, not recreate.
  const rerun = await createCompanies(api, 'apply', {
    source: trickySource,
    csvOptions: trickyCsvOptions,
  });
  assert.equal(rerun.createdCount, 0);
  assert.equal(rerun.alreadyPresentCount, 3);
});

test('company creation fails closed when a write did not land', async () => {
  const api = new FakeApi();
  api.companies = [];
  api.createCompany = async (company: { name: string }) => {
    api.companyCreates.push(company);
  };

  await assert.rejects(
    createCompanies(api, 'apply'),
    /post-write verification failed/,
  );
});
