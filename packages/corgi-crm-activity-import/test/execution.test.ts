import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  runActivityImport,
  runActivityImportCompanyCreation,
  runActivityImportDuplicateCompanyResolution,
  type ActivityImportApi,
  type ActivityImportCheckpoint,
} from '../src/execution.ts';
import {
  deterministicActivityId,
  REQUIRED_COMPANY_LINK_FIELDS,
  type ActivityImportCompany,
  type ActivityImportManifest,
  type OutreachActivityRecord,
} from '../src/importer.ts';

const uuid = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const OLDER_COMPANY = '2026-01-04T10:00:00.000Z';
const NEWER_COMPANY = '2026-09-10T18:30:00.000Z';
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

// A company with every link collection present and empty: the shape a probe
// returns for a record that is genuinely safe to remove.
const emptyLinks = (): Record<string, unknown> =>
  Object.fromEntries(REQUIRED_COMPANY_LINK_FIELDS.map((field) => [field, []]));

class FakeApi implements ActivityImportApi {
  companies: ActivityImportCompany[] = [
    { id: uuid('4'), name: 'Acme' },
    { id: uuid('5'), name: 'Beta' },
  ];
  companyLinks = new Map<string, Record<string, unknown>>();
  companyDeletes: string[] = [];
  softDeletedCompanies: ActivityImportCompany[] = [];
  companyListReads = 0;
  companyCreateSequence = 0;
  wholesalers = [{ id: uuid('6'), workspaceMemberId: identities.Nash }];
  people = [];
  activities: OutreachActivityRecord[] = [];
  checkpoints: ActivityImportCheckpoint[] = [];
  creates: OutreachActivityRecord[] = [];
  companyCreates: { name: string }[] = [];
  failOnCreateNumber: number | undefined;

  async listCompanies() {
    this.companyListReads += 1;

    return this.companies;
  }
  async listSoftDeletedCompanies() {
    return this.softDeletedCompanies;
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
    this.companyCreateSequence += 1;
    // A distinct ID per write, as the CRM issues. Reusing one made the fake
    // listing repeat a record, which the listing stability check rejects.
    this.companies.push({
      id: `77777777-7777-4777-8777-${String(this.companyCreateSequence).padStart(12, '0')}`,
      name: company.name,
      createdAt: NEWER_COMPANY,
    });
  }
  async readCompanyLinks(companyId: string) {
    return {
      id: companyId,
      ...emptyLinks(),
      ...(this.companyLinks.get(companyId) ?? {}),
    };
  }
  async deleteCompany(companyId: string) {
    this.companyDeletes.push(companyId);
    // A soft delete drops the record out of the default listing, which is the
    // only thing the exact-match contract reads.
    this.companies = this.companies.filter(({ id }) => id !== companyId);
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
    createCompanies(api, 'apply', {
      confirmation: 'IMPORT_CRM_OUTREACH_ACTIVITIES',
    }),
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

const resolveDuplicates = (
  api: ActivityImportApi,
  mode: 'dry-run' | 'apply',
  overrides: { confirmation?: string } = {},
) =>
  runActivityImportDuplicateCompanyResolution(api, {
    source,
    csvOptions,
    mode,
    confirmation:
      'confirmation' in overrides
        ? overrides.confirmation
        : mode === 'apply'
          ? 'RESOLVE_CRM_DUPLICATE_COMPANIES'
          : undefined,
  });

// The production shape: "Acme" exists once carrying its history, and the
// company creation step minted a second empty one alongside it.
const withMintedDuplicate = () => {
  const api = new FakeApi();
  api.companies = [
    { id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY },
    { id: uuid('5'), name: 'Acme', createdAt: NEWER_COMPANY },
    { id: uuid('6'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];
  api.companyLinks.set(uuid('4'), {
    outreachActivities: [{ id: uuid('8') }, { id: uuid('9') }],
  });

  return api;
};

test('duplicate resolution is off by default and leaves the import unchanged', async () => {
  const untouched = new FakeApi();
  const baseline = await run(new FakeApi(), 'dry-run');

  // A resolve-capable API must not change what a plain import does.
  assert.deepEqual(await run(untouched, 'dry-run'), baseline);
  assert.equal(untouched.companyDeletes.length, 0);
});

test('duplicate resolution removes the empty duplicate and keeps the linked record', async () => {
  const api = withMintedDuplicate();

  const result = await resolveDuplicates(api, 'apply');

  assert.equal(result.operation, 'resolve-duplicate-companies');
  assert.equal(result.mode, 'apply');
  assert.equal(result.duplicateGroupCount, 1);
  assert.equal(result.removedCount, 1);
  assert.equal(result.blockedGroupCount, 0);
  assert.deepEqual(api.companyDeletes, [uuid('5')]);
  // The survivor is the one carrying the history, not the one that is newer.
  assert.deepEqual(
    api.companies.map(({ id }) => id),
    [uuid('4'), uuid('6')],
  );
  const retained = result.groups[0]?.records.find(
    ({ decision }) => decision === 'retain-linked',
  );
  assert.equal(retained?.companyId, uuid('4'));
  assert.deepEqual(retained?.linkedFieldNames, ['outreachActivities']);
});

test('duplicate resolution reports every record and why, so nothing is silent', async () => {
  const result = await resolveDuplicates(withMintedDuplicate(), 'dry-run');

  assert.equal(result.groups.length, 1);
  assert.deepEqual(
    result.groups[0]?.records.map(({ companyId, decision }) => ({
      companyId,
      decision,
    })),
    [
      { companyId: uuid('4'), decision: 'retain-linked' },
      { companyId: uuid('5'), decision: 'remove' },
    ],
  );
  for (const record of result.groups[0]?.records ?? []) {
    assert.match(record.reason, /\w/);
  }
});

test('duplicate resolution dry-run removes nothing', async () => {
  const api = withMintedDuplicate();

  const result = await resolveDuplicates(api, 'dry-run');

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.plannedRemovalCount, 1);
  assert.equal(result.removedCount, 0);
  assert.equal(api.companyDeletes.length, 0);
  assert.equal(api.companies.length, 3);
});

test('duplicate resolution refuses when both duplicates carry links', async () => {
  const api = withMintedDuplicate();
  api.companyLinks.set(uuid('5'), { meetingBookings: [{ id: uuid('a') }] });

  const result = await resolveDuplicates(api, 'apply');

  assert.equal(result.removedCount, 0);
  assert.equal(result.blockedGroupCount, 1);
  assert.equal(api.companyDeletes.length, 0);
  assert.equal(api.companies.length, 3);
  assert.match(
    result.groups[0]?.blockedReason ?? '',
    /2 of 2 duplicates carry linked records/,
  );
});

test('duplicate resolution removes nothing when every name matches one record', async () => {
  const api = new FakeApi();
  api.companies = [
    { id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY },
    { id: uuid('6'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];

  const result = await resolveDuplicates(api, 'apply');

  assert.equal(result.duplicateGroupCount, 0);
  assert.equal(result.removedCount, 0);
  assert.deepEqual(result.groups, []);
  assert.equal(api.companyDeletes.length, 0);
});

test('a second duplicate resolution run removes nothing', async () => {
  const api = withMintedDuplicate();

  const first = await resolveDuplicates(api, 'apply');
  const second = await resolveDuplicates(api, 'apply');

  assert.equal(first.removedCount, 1);
  assert.equal(second.removedCount, 0);
  assert.equal(second.duplicateGroupCount, 0);
  assert.deepEqual(api.companyDeletes, [uuid('5')]);
});

test('duplicate resolution requires its own confirmation string', async () => {
  const api = withMintedDuplicate();

  await assert.rejects(
    resolveDuplicates(api, 'apply', {
      confirmation: 'CREATE_CRM_IMPORT_COMPANIES',
    }),
    /duplicate resolution confirmation is invalid/,
  );
  await assert.rejects(
    resolveDuplicates(api, 'apply', { confirmation: undefined }),
    /duplicate resolution confirmation is invalid/,
  );
  await assert.rejects(
    resolveDuplicates(api, 'dry-run', {
      confirmation: 'RESOLVE_CRM_DUPLICATE_COMPANIES',
    }),
    /cannot include apply approval/,
  );
  assert.equal(api.companyDeletes.length, 0);
});

test('duplicate resolution fails closed when the API cannot remove a company', async () => {
  const api = withMintedDuplicate();
  const { deleteCompany: _deleteCompany, ...withoutDelete } = {
    listCompanies: () => api.listCompanies(),
    listWholesalers: () => api.listWholesalers(),
    listPeople: () => api.listPeople(),
    listOutreachActivities: () => api.listOutreachActivities(),
    createOutreachActivity: (record: OutreachActivityRecord) =>
      api.createOutreachActivity(record),
    readCompanyLinks: (companyId: string) => api.readCompanyLinks(companyId),
    deleteCompany: (companyId: string) => api.deleteCompany(companyId),
    readCheckpoint: () => api.readCheckpoint(),
    writeCheckpoint: (checkpoint: ActivityImportCheckpoint) =>
      api.writeCheckpoint(checkpoint),
  };

  await assert.rejects(
    resolveDuplicates(withoutDelete, 'apply'),
    /cannot remove companies/,
  );
  assert.equal(api.companyDeletes.length, 0);
});

test('duplicate resolution fails closed when it cannot probe company links', async () => {
  const api = withMintedDuplicate();
  const { readCompanyLinks: _readCompanyLinks, ...withoutProbe } = {
    listCompanies: () => api.listCompanies(),
    listWholesalers: () => api.listWholesalers(),
    listPeople: () => api.listPeople(),
    listOutreachActivities: () => api.listOutreachActivities(),
    createOutreachActivity: (record: OutreachActivityRecord) =>
      api.createOutreachActivity(record),
    readCompanyLinks: (companyId: string) => api.readCompanyLinks(companyId),
    deleteCompany: (companyId: string) => api.deleteCompany(companyId),
    readCheckpoint: () => api.readCheckpoint(),
    writeCheckpoint: (checkpoint: ActivityImportCheckpoint) =>
      api.writeCheckpoint(checkpoint),
  };

  // Without a probe nothing can be proven empty, so neither mode may proceed.
  await assert.rejects(
    resolveDuplicates(withoutProbe, 'dry-run'),
    /cannot inspect company links/,
  );
  await assert.rejects(
    resolveDuplicates(withoutProbe, 'apply'),
    /cannot inspect company links/,
  );
  assert.equal(api.companyDeletes.length, 0);
});

test('duplicate resolution fails when the removal did not take', async () => {
  const api = withMintedDuplicate();
  // A delete the CRM accepted but did not apply must not be reported as done.
  api.deleteCompany = async (companyId: string) => {
    api.companyDeletes.push(companyId);
  };

  await assert.rejects(
    resolveDuplicates(api, 'apply'),
    /post-write verification failed/,
  );
});

test('duplicate resolution writes no CRM record and leaks no source text', async () => {
  const api = withMintedDuplicate();

  const result = await resolveDuplicates(api, 'apply');

  assert.equal(api.creates.length, 0);
  assert.equal(api.companyCreates.length, 0);
  assert.equal(api.checkpoints.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /Reached them/);
});

test('company creation reads the listing twice before trusting it', async () => {
  const api = new FakeApi();
  api.companies = [{ id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY }];

  await createCompanies(api, 'dry-run');

  // One walk cannot detect its own skip, so the plan never rests on one.
  assert.equal(api.companyListReads, 2);
});

test('company creation refuses when the two listing walks disagree', async () => {
  const api = new FakeApi();
  const full = [
    { id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY },
    { id: uuid('5'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];
  // The pagination-skip hypothesis made concrete: the second walk drops Beta.
  api.listCompanies = async () => {
    api.companyListReads += 1;

    return api.companyListReads === 1 ? full : [full[0]!];
  };

  await assert.rejects(
    createCompanies(api, 'apply'),
    /listing was not stable across two reads/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('company creation refuses to create over a soft-deleted namesake', async () => {
  const api = new FakeApi();
  api.companies = [{ id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY }];
  // Invisible to the zero-match check, a duplicate the moment it is restored.
  api.softDeletedCompanies = [
    { id: uuid('9'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];

  await assert.rejects(
    createCompanies(api, 'apply'),
    /refused "Beta"[\s\S]*soft-deleted company already carries that name/,
  );
  assert.equal(api.companyCreates.length, 0);
});

test('a soft-deleted namesake behind an existing company does not block creation', async () => {
  const api = new FakeApi();
  api.companies = [
    { id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY },
    { id: uuid('5'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];
  // Nothing is created for Acme, so its namesake is latent, not a blocker.
  api.softDeletedCompanies = [
    { id: uuid('9'), name: 'Acme', createdAt: OLDER_COMPANY },
  ];

  const result = await createCompanies(api, 'apply');

  assert.equal(result.createdCount, 0);
  assert.deepEqual(result.softDeletedNamesakes, []);
});

test('a company creation dry-run reports a soft-deleted namesake without failing', async () => {
  const api = new FakeApi();
  api.companies = [{ id: uuid('4'), name: 'Acme', createdAt: OLDER_COMPANY }];
  api.softDeletedCompanies = [
    { id: uuid('9'), name: 'Beta', createdAt: OLDER_COMPANY },
  ];

  const result = await createCompanies(api, 'dry-run');

  // The dry run is the pre-flight, so it has to surface the trap, not hit it.
  assert.deepEqual(result.softDeletedNamesakes, [
    { name: 'Beta', companyIds: [uuid('9')] },
  ]);
  assert.deepEqual(result.plannedNames, ['Beta']);
  assert.equal(api.companyCreates.length, 0);
});

test('company creation fails closed when it cannot see soft-deleted companies', async () => {
  const api = new FakeApi();
  api.companies = [];
  const { listSoftDeletedCompanies: _omitted, ...blind } = {
    listCompanies: () => api.listCompanies(),
    listSoftDeletedCompanies: () => api.listSoftDeletedCompanies(),
    listWholesalers: () => api.listWholesalers(),
    listPeople: () => api.listPeople(),
    listOutreachActivities: () => api.listOutreachActivities(),
    createOutreachActivity: (record: OutreachActivityRecord) =>
      api.createOutreachActivity(record),
    createCompany: (company: { name: string }) => api.createCompany(company),
    readCheckpoint: () => api.readCheckpoint(),
    writeCheckpoint: (checkpoint: ActivityImportCheckpoint) =>
      api.writeCheckpoint(checkpoint),
  };

  await assert.rejects(
    runActivityImportCompanyCreation(blind, {
      source,
      csvOptions,
      mode: 'apply',
      confirmation: 'CREATE_CRM_IMPORT_COMPANIES',
    }),
    /cannot see soft-deleted companies/,
  );
  assert.equal(api.companyCreates.length, 0);
});
