import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  activityImportCompanyMatchKey,
  assertTerritoryIdentityArtifact,
  buildActivityImportPlan,
  buildCompanyCreationPlan,
  buildDuplicateCompanyResolutionPlan,
  findDuplicateCompanyGroups,
  REQUIRED_COMPANY_LINK_FIELDS,
  summarizeCompanyLinks,
  deterministicActivityId,
  deterministicCompletedActivityId,
  parseActivityCsv,
  type ActivityImportCsvOptions,
  type CanonicalActivityOutcome,
  type CompletedActivityType,
  type OutreachActivityRecord,
} from '../src/importer.ts';

const uuid = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

const identities = {
  Grace: uuid('1'),
  Nash: uuid('3'),
};

const identityArtifact = {
  workspaceMemberIds: identities,
  aggregateIdentityHash: createHash('sha256')
    .update(
      `Grace=${identities.Grace}\nNash=${identities.Nash}`,
      'utf8',
    )
    .digest('hex'),
};

const source = Buffer.from(
  '"Acme, Inc.",555,Website,LinkedIn,a@example.com,Alice,$1M,"Called,\nleft voicemail",extra,final\r\n' +
    'Beta,,,LinkedIn,b@example.com,Bob,,first detail,second detail,third detail\r\n',
  'utf8',
);

const options = (overrides: Partial<ActivityImportCsvOptions> = {}) => ({
  sourceFormat: 'legacy-nash-outreach-v1' as const,
  ownerLabel: 'Nash' as const,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  provenanceSha256: createHash('sha256').update(source).digest('hex'),
  expectedRows: 2,
  activityDate: '2026-09-09',
  timeZone: 'America/Chicago',
  importId: 'nash-calls-2026-09-09',
  ...overrides,
});

const completedColumns = [
  ['7', '1', 'Acme, Inc.', 'phone_call', 'left_voicemail', 'Try again'],
  ['7', '2', 'Acme, Inc.', 'email', 'other', 'Sent recap'],
] as const;
const completedSource = Buffer.from(
  '7,1,"Acme, Inc.",phone_call,left_voicemail,Try again\n' +
    '7,2,"Acme, Inc.",email,other,Sent recap\n',
);
const rowSequenceSha256For = (
  columns: readonly (readonly string[])[],
): string =>
  createHash('sha256')
    .update(
      columns
        .map((row) =>
          createHash('sha256').update(JSON.stringify(row)).digest('hex'),
        )
        .join('\n'),
    )
    .digest('hex');
const completedRowSequenceSha256 = rowSequenceSha256For(completedColumns);
const completedNormalizationReceipt = {
  schemaVersion: 1 as const,
  sourceFormat: 'completed-actions-v2' as const,
  sourceDocumentSha256: 'a'.repeat(64),
  normalizedCsvSha256: createHash('sha256')
    .update(completedSource)
    .digest('hex'),
  rowSequenceSha256: completedRowSequenceSha256,
  sourceRowCount: 7,
  activityCount: 2,
  phoneCallCount: 1,
  voicemailCount: 1,
  emailCount: 1,
};
const completedOptions = (overrides = {}) => ({
  sourceFormat: 'completed-actions-v2' as const,
  ownerLabel: 'Grace' as const,
  sourceSha256: createHash('sha256').update(completedSource).digest('hex'),
  provenanceSha256: 'a'.repeat(64),
  expectedRowSequenceSha256: completedRowSequenceSha256,
  expectedRows: 2,
  activityDate: '2026-09-09',
  timeZone: 'America/Chicago',
  importId: 'completed-actions-2026-09-09',
  normalizationReceipt: completedNormalizationReceipt,
  ...overrides,
});

test('parses quoted multiline headerless rows and preserves blank activities', () => {
  const rows = parseActivityCsv(source, options());

  assert.deepEqual(rows, [
    {
      rowNumber: 1,
      companyName: 'Acme, Inc.',
      phone: '555',
      websiteEvidence: 'Website',
      linkedInEvidence: 'LinkedIn',
      contactEmail: 'a@example.com',
      contactName: 'Alice',
      assetsUnderManagement: '$1M',
      primaryNotes: 'Called,\nleft voicemail',
      additionalDetailOne: 'extra',
      additionalDetailTwo: 'final',
      notes: 'Called,\nleft voicemail\nextra\nfinal',
      occurredAt: '2026-09-09T17:00:00.000Z',
    },
    {
      rowNumber: 2,
      companyName: 'Beta',
      phone: null,
      websiteEvidence: null,
      linkedInEvidence: 'LinkedIn',
      contactEmail: 'b@example.com',
      contactName: 'Bob',
      assetsUnderManagement: null,
      primaryNotes: 'first detail',
      additionalDetailOne: 'second detail',
      additionalDetailTwo: 'third detail',
      notes: 'first detail\nsecond detail\nthird detail',
      occurredAt: '2026-09-09T17:00:00.000Z',
    },
  ]);
});

test('parses completed action rows with exact provenance and row hashes', () => {
  assert.deepEqual(parseActivityCsv(completedSource, completedOptions()), [
    {
      rowNumber: 1,
      sourceRowNumber: 7,
      actionOrdinal: 1,
      companyName: 'Acme, Inc.',
      activityType: 'phone_call',
      outcome: 'left_voicemail',
      notes: 'Try again',
      occurredAt: '2026-09-09T17:00:00.000Z',
    },
    {
      rowNumber: 2,
      sourceRowNumber: 7,
      actionOrdinal: 2,
      companyName: 'Acme, Inc.',
      activityType: 'email',
      outcome: 'other',
      notes: 'Sent recap',
      occurredAt: '2026-09-09T17:00:00.000Z',
    },
  ]);

  assert.throws(
    () =>
      parseActivityCsv(
        completedSource,
        completedOptions({
          expectedRowSequenceSha256: '0'.repeat(64),
          normalizationReceipt: {
            ...completedNormalizationReceipt,
            rowSequenceSha256: '0'.repeat(64),
          },
        }),
      ),
    /row sequence SHA-256 mismatch/,
  );
  assert.throws(
    () =>
      parseActivityCsv(
        completedSource,
        completedOptions({ provenanceSha256: 'invalid' }),
      ),
    /provenance SHA-256 is invalid/,
  );
});

const compatibilityMatrix: Readonly<
  Record<CompletedActivityType, ReadonlySet<CanonicalActivityOutcome>>
> = {
  phone_call: new Set(['left_voicemail', 'no_response', 'connected', 'other']),
  email: new Set([
    'no_response',
    'follow_up_scheduled',
    'not_interested',
    'other',
  ]),
};
for (const activityType of ['phone_call', 'email'] as const) {
  for (const outcome of [
    'left_voicemail',
    'no_response',
    'connected',
    'follow_up_scheduled',
    'not_interested',
    'other',
  ] as const) {
    const allowed = compatibilityMatrix[activityType].has(outcome);
    test(`parser ${allowed ? 'allows' : 'rejects'} ${activityType} + ${outcome}`, () => {
      const columns = [
        ['7', '1', 'Acme', activityType, outcome, 'Synthetic note'],
      ] as const;
      const pairSource = Buffer.from(
        `7,1,Acme,${activityType},${outcome},Synthetic note\n`,
      );
      const pairSourceSha256 = createHash('sha256')
        .update(pairSource)
        .digest('hex');
      const pairRowSequenceSha256 = rowSequenceSha256For(columns);
      const parsePair = () =>
        parseActivityCsv(pairSource, {
          ...completedOptions(),
          sourceSha256: pairSourceSha256,
          expectedRowSequenceSha256: pairRowSequenceSha256,
          expectedRows: 1,
          normalizationReceipt: {
            ...completedNormalizationReceipt,
            normalizedCsvSha256: pairSourceSha256,
            rowSequenceSha256: pairRowSequenceSha256,
            activityCount: 1,
            phoneCallCount: activityType === 'phone_call' ? 1 : 0,
            voicemailCount:
              activityType === 'phone_call' && outcome === 'left_voicemail'
                ? 1
                : 0,
            emailCount: activityType === 'email' ? 1 : 0,
          },
        });

      if (allowed) assert.doesNotThrow(parsePair);
      else assert.throws(parsePair, /incompatible activity type and outcome/);
    });
  }
}

test('rejects a changed source, wrong row count, malformed width, and invalid timezone', () => {
  assert.throws(
    () =>
      parseActivityCsv(
        source,
        options({
          sourceSha256: '0'.repeat(64),
          provenanceSha256: '0'.repeat(64),
        }),
      ),
    /source SHA-256 mismatch/,
  );
  assert.throws(
    () => parseActivityCsv(source, options({ expectedRows: 3 })),
    /logical row count mismatch/,
  );
  const malformed = Buffer.from('Acme,,,,,,,,\n');
  assert.throws(
    () =>
      parseActivityCsv(malformed, {
        ...options(),
        sourceSha256: createHash('sha256').update(malformed).digest('hex'),
        provenanceSha256: createHash('sha256').update(malformed).digest('hex'),
        expectedRows: 1,
      }),
    /exactly 10 columns/,
  );
  assert.throws(
    () => parseActivityCsv(source, options({ timeZone: 'not/a-zone' })),
    /time zone is invalid/,
  );
});

test('validates the immutable territory identity artifact and detects tampering', () => {
  assert.deepEqual(
    assertTerritoryIdentityArtifact(identityArtifact),
    identityArtifact,
  );
  assert.throws(
    () =>
      assertTerritoryIdentityArtifact({
        ...identityArtifact,
        aggregateIdentityHash: '0'.repeat(64),
      }),
    /identity artifact is invalid/,
  );
});

test('derives stable distinct RFC 4122 version 5 IDs from import ID and row', () => {
  const first = deterministicActivityId(options().importId, 1);
  assert.equal(first, '3e048693-e9aa-59de-8fe4-d90263d8e00b');
  assert.equal(first, deterministicActivityId(options().importId, 1));
  assert.notEqual(first, deterministicActivityId(options().importId, 2));
  assert.notEqual(first, deterministicActivityId('another-import', 1));
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

const planInput = (existingActivities: OutreachActivityRecord[] = []) => ({
  rows: parseActivityCsv(source, options()),
  csvOptions: options(),
  identityArtifact,
  companies: [
    { id: uuid('4'), name: 'Acme, Inc.' },
    { id: uuid('5'), name: 'Beta' },
  ],
  wholesalers: [
    { id: uuid('6'), workspaceMemberId: identities.Nash },
    { id: uuid('7'), workspaceMemberId: identities.Grace },
  ],
  people: [
    {
      id: uuid('8'),
      companyId: uuid('4'),
      name: { firstName: 'Alice', lastName: '' },
      emails: { primaryEmail: 'A@EXAMPLE.COM', additionalEmails: [] },
    },
    {
      id: uuid('9'),
      companyId: uuid('4'),
      name: { firstName: 'Bob', lastName: '' },
      emails: { primaryEmail: 'b@example.com', additionalEmails: [] },
    },
  ],
  existingActivities,
});

test('plans one call per row with exact company and Nash ownership only', () => {
  const plan = buildActivityImportPlan(planInput());

  assert.equal(plan.activities.length, 2);
  assert.deepEqual(plan.activities[0]?.record, {
    id: deterministicActivityId(options().importId, 1),
    name: 'Call',
    companyId: uuid('4'),
    wholesalerId: uuid('6'),
    activityType: 'call',
    occurredAt: '2026-09-09T17:00:00.000Z',
    notes: 'Called,\nleft voicemail\nextra\nfinal',
    contactId: uuid('8'),
  });
  assert.equal(plan.activities[1]?.record.contactId, null);
  assert.ok(!('outcome' in plan.activities[0]!.record));
});

test('plans canonical completed actions for one explicitly selected owner', () => {
  const rows = parseActivityCsv(completedSource, completedOptions());
  const plan = buildActivityImportPlan({
    rows,
    csvOptions: completedOptions(),
    identityArtifact,
    companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
    wholesalers: [
      { id: uuid('6'), workspaceMemberId: identities.Nash },
      { id: uuid('7'), workspaceMemberId: identities.Grace },
    ],
    people: [],
    existingActivities: [],
  });

  assert.deepEqual(
    plan.activities.map(({ record }) => record),
    [
      {
        id: deterministicCompletedActivityId({
          provenanceSha256: 'a'.repeat(64),
          ownerWorkspaceMemberId: identities.Grace,
          sourceRowNumber: 7,
          actionOrdinal: 1,
          activityType: 'phone_call',
          outcome: 'left_voicemail',
        }),
        name: 'Phone call · Left voicemail',
        companyId: uuid('4'),
        wholesalerId: uuid('7'),
        activityType: 'phone_call',
        outcome: 'left_voicemail',
        occurredAt: '2026-09-09T17:00:00.000Z',
        notes: 'Try again',
        contactId: null,
      },
      {
        id: deterministicCompletedActivityId({
          provenanceSha256: 'a'.repeat(64),
          ownerWorkspaceMemberId: identities.Grace,
          sourceRowNumber: 7,
          actionOrdinal: 2,
          activityType: 'email',
          outcome: 'other',
        }),
        name: 'Email · Other',
        companyId: uuid('4'),
        wholesalerId: uuid('7'),
        activityType: 'email',
        outcome: 'other',
        occurredAt: '2026-09-09T17:00:00.000Z',
        notes: 'Sent recap',
        contactId: null,
      },
    ],
  );
  assert.equal(plan.manifest.ownerLabel, 'Grace');
  assert.equal(plan.manifest.provenanceSha256, 'a'.repeat(64));
  assert.equal(plan.manifest.rowSequenceSha256, completedRowSequenceSha256);
  assert.deepEqual(
    plan.manifest.normalizationReceipt,
    completedNormalizationReceipt,
  );
});

test('v2 IDs bind immutable source position and reject semantic drift as a collision', () => {
  const buildCompletedPlan = (
    csvOptions = completedOptions(),
    existingActivities: OutreachActivityRecord[] = [],
  ) =>
    buildActivityImportPlan({
      rows: parseActivityCsv(completedSource, csvOptions),
      csvOptions,
      identityArtifact,
      companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
      wholesalers: [
        { id: uuid('7'), workspaceMemberId: identities.Grace },
        { id: uuid('8'), workspaceMemberId: identities.Nash },
      ],
      people: [],
      existingActivities,
    });
  const first = buildCompletedPlan();
  const renamedImport = completedOptions({
    importId: 'operator-renamed-import',
  });
  const second = buildCompletedPlan(
    renamedImport,
    first.activities.map(({ record }) => record),
  );
  assert.deepEqual(
    second.activities.map(({ record }) => record.id),
    first.activities.map(({ record }) => record.id),
  );
  assert.deepEqual(
    second.activities.map(({ state }) => state),
    ['existing', 'existing'],
  );

  assert.equal(
    deterministicCompletedActivityId({
      provenanceSha256: 'a'.repeat(64),
      ownerWorkspaceMemberId: identities.Grace,
      sourceRowNumber: 7,
      actionOrdinal: 2,
      activityType: 'email',
      outcome: 'other',
    }),
    deterministicCompletedActivityId({
      provenanceSha256: 'a'.repeat(64),
      ownerWorkspaceMemberId: identities.Grace,
      sourceRowNumber: 7,
      actionOrdinal: 2,
      activityType: 'phone_call',
      outcome: 'no_response',
    }),
  );

  const driftColumns = [
    ['7', '1', 'Acme, Inc.', 'phone_call', 'left_voicemail', 'Try again'],
    ['7', '2', 'Acme, Inc.', 'phone_call', 'no_response', 'Sent recap'],
  ] as const;
  const driftSource = Buffer.from(
    '7,1,"Acme, Inc.",phone_call,left_voicemail,Try again\n' +
      '7,2,"Acme, Inc.",phone_call,no_response,Sent recap\n',
  );
  const driftSourceSha256 = createHash('sha256')
    .update(driftSource)
    .digest('hex');
  const driftRowSequenceSha256 = rowSequenceSha256For(driftColumns);
  const driftOptions = completedOptions({
    sourceSha256: driftSourceSha256,
    expectedRowSequenceSha256: driftRowSequenceSha256,
    normalizationReceipt: {
      ...completedNormalizationReceipt,
      normalizedCsvSha256: driftSourceSha256,
      rowSequenceSha256: driftRowSequenceSha256,
      phoneCallCount: 2,
      emailCount: 0,
    },
  });
  assert.throws(
    () =>
      buildActivityImportPlan({
        rows: parseActivityCsv(driftSource, driftOptions),
        csvOptions: driftOptions,
        identityArtifact,
        companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
        wholesalers: [{ id: uuid('7'), workspaceMemberId: identities.Grace }],
        people: [],
        existingActivities: first.activities.map(({ record }) => record),
      }),
    /deterministic activity ID collision/,
  );

  const changedOwner = buildCompletedPlan(
    completedOptions({ ownerLabel: 'Nash' as const }),
  );
  assert.notDeepEqual(
    changedOwner.activities.map(({ record }) => record.id),
    first.activities.map(({ record }) => record.id),
  );

  const changedProvenance = 'b'.repeat(64);
  const changedSourceDocument = buildCompletedPlan(
    completedOptions({
      provenanceSha256: changedProvenance,
      normalizationReceipt: {
        ...completedNormalizationReceipt,
        sourceDocumentSha256: changedProvenance,
      },
    }),
  );
  assert.notDeepEqual(
    changedSourceDocument.activities.map(({ record }) => record.id),
    first.activities.map(({ record }) => record.id),
  );
});

test('legacy source remains Nash-only and every owner must resolve uniquely', () => {
  assert.throws(
    () => parseActivityCsv(source, options({ ownerLabel: 'Grace' as never })),
    /legacy source owner must be Nash/,
  );
  assert.throws(
    () =>
      buildActivityImportPlan({
        ...planInput(),
        csvOptions: options({ ownerLabel: 'Grace' as never }),
      }),
    /legacy source owner must be Nash/,
  );

  const rows = parseActivityCsv(completedSource, completedOptions());
  assert.throws(
    () =>
      buildActivityImportPlan({
        rows,
        csvOptions: completedOptions(),
        identityArtifact,
        companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
        wholesalers: [],
        people: [],
        existingActivities: [],
      }),
    /Grace must match exactly one wholesaler/,
  );
});

test('sets contact null when evidence is missing, ambiguous, or cross-company', () => {
  const missing = buildActivityImportPlan({ ...planInput(), people: [] });
  assert.deepEqual(
    missing.activities.map(({ record }) => record.contactId),
    [null, null],
  );

  const ambiguous = buildActivityImportPlan({
    ...planInput(),
    people: [
      ...planInput().people,
      {
        id: uuid('a'),
        companyId: uuid('4'),
        name: { firstName: 'Alice', lastName: '' },
        emails: { primaryEmail: 'other@example.com', additionalEmails: [] },
      },
    ],
  });
  assert.equal(ambiguous.activities[0]?.record.contactId, null);
  assert.equal(ambiguous.activities[1]?.record.contactId, null);
});

test('marks exact deterministic records as existing and blocks collisions before apply', () => {
  const initial = buildActivityImportPlan(planInput());
  const exactExisting = initial.activities.map(({ record }) => record);
  const idempotent = buildActivityImportPlan(planInput(exactExisting));
  assert.deepEqual(
    idempotent.activities.map(({ state }) => state),
    ['existing', 'existing'],
  );

  assert.throws(
    () =>
      buildActivityImportPlan(
        planInput([{ ...exactExisting[0]!, notes: 'different' }]),
      ),
    /deterministic activity ID collision/,
  );
});

test('fails closed on missing or ambiguous exact company and Nash matches', () => {
  assert.throws(
    () =>
      buildActivityImportPlan({
        ...planInput(),
        companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
      }),
    /row 2 must match exactly one company/,
  );
  assert.throws(
    () =>
      buildActivityImportPlan({
        ...planInput(),
        companies: [...planInput().companies, { id: uuid('8'), name: 'Beta' }],
      }),
    /row 2 must match exactly one company/,
  );
  assert.throws(
    () =>
      buildActivityImportPlan({
        ...planInput(),
        wholesalers: [],
      }),
    /Nash must match exactly one wholesaler/,
  );
});

test('emits a stable PII-free manifest', () => {
  const { manifest } = buildActivityImportPlan(planInput());
  const serialized = JSON.stringify(manifest);

  assert.equal(manifest.rowCount, 2);
  assert.equal(manifest.blankNoteCount, 0);
  assert.equal(manifest.distinctCompanyCount, 2);
  assert.doesNotMatch(serialized, /Acme|Beta|voicemail|555|a@example/);
  for (const hash of [
    manifest.sourceSha256,
    manifest.provenanceSha256,
    manifest.rowSequenceSha256,
    manifest.importIdHash,
    manifest.activityIdSetHash,
    manifest.planHash,
  ]) {
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});

const EN_DASH_FIRM = 'Holistic Planning \u2013 Kansas City';
const PIPE_FIRM = 'WEALTH | KC';
const AMPERSAND_FIRM = 'Atwood & Palmer, Inc.';

const creationRows = (names: readonly string[]) =>
  names.map((companyName, index) => ({
    rowNumber: index + 1,
    companyName,
    notes: null,
    occurredAt: '2026-09-09T12:00:00.000Z',
  }));

test('company creation plans only the names that match zero companies', () => {
  const plan = buildCompanyCreationPlan({
    rows: creationRows(['Acme, Inc.', 'Missing Firm']),
    companies: [{ id: uuid('4'), name: 'Acme, Inc.' }],
  });

  assert.deepEqual(
    plan.creations.map(({ name }) => name),
    ['Missing Firm'],
  );
  assert.equal(plan.alreadyPresentCount, 1);
  assert.deepEqual(plan.ambiguousRows, []);
});

test('company creation reports a two-or-more match instead of planning a duplicate', () => {
  const plan = buildCompanyCreationPlan({
    rows: creationRows(['Acme, Inc.']),
    companies: [
      { id: uuid('4'), name: 'Acme, Inc.' },
      { id: uuid('5'), name: 'Acme, Inc.' },
    ],
  });

  assert.deepEqual(plan.creations, []);
  assert.deepEqual(plan.ambiguousRows, [
    { rowNumber: 1, companyName: 'Acme, Inc.', matchCount: 2 },
  ]);
});

test('company creation preserves an en dash, a pipe, and an ampersand exactly', () => {
  const names = [EN_DASH_FIRM, PIPE_FIRM, AMPERSAND_FIRM];
  const plan = buildCompanyCreationPlan({
    rows: creationRows(names),
    companies: [],
  });

  assert.deepEqual(
    plan.creations.map(({ name }) => name),
    names,
  );
  // A transliterated dash is the exact failure that would leave the very next
  // import unmatched, so assert the codepoint rather than the rendered glyph.
  assert.equal(plan.creations[0]?.name.includes('\u2013'), true);
  assert.equal(plan.creations[0]?.name.includes('-'), false);
  assert.equal(plan.creations[1]?.name, 'WEALTH | KC');
  assert.equal(plan.creations[2]?.name, 'Atwood & Palmer, Inc.');
  for (const name of names) {
    assert.equal(activityImportCompanyMatchKey(name), name);
  }
});

test('a created name matches itself on the next import attempt', () => {
  const names = [EN_DASH_FIRM, PIPE_FIRM, AMPERSAND_FIRM];
  const created = buildCompanyCreationPlan({
    rows: creationRows(names),
    companies: [],
  }).creations.map(({ name }, index) => ({
    id: uuid(String(index + 4)),
    name,
  }));

  const rematched = buildCompanyCreationPlan({
    rows: creationRows(names),
    companies: created,
  });

  assert.deepEqual(rematched.creations, []);
  assert.equal(rematched.alreadyPresentCount, names.length);
});

test('company creation collapses repeated rows for one firm into a single record', () => {
  const plan = buildCompanyCreationPlan({
    rows: creationRows([PIPE_FIRM, PIPE_FIRM, PIPE_FIRM]),
    companies: [],
  });

  assert.equal(plan.creations.length, 1);
  assert.deepEqual(plan.creations[0]?.rowNumbers, [1, 2, 3]);
});

test('company creation rejects an invalid company snapshot', () => {
  assert.throws(
    () =>
      buildCompanyCreationPlan({
        rows: creationRows(['Acme, Inc.']),
        companies: [{ id: 'not-a-uuid', name: 'Acme, Inc.' }],
      }),
    /company snapshot is invalid/,
  );
});

const OLDER = '2026-01-04T10:00:00.000Z';
const NEWER = '2026-09-10T18:30:00.000Z';

// Built from the exported requirement so a newly required relation makes these
// fixtures represent a genuinely empty company instead of silently omitting it.
const probeRecord = (
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  name: 'BMG Advisors',
  createdAt: OLDER,
  ...Object.fromEntries(
    REQUIRED_COMPANY_LINK_FIELDS.map((field) => [
      field,
      field.endsWith('Id') ? null : [],
    ]),
  ),
  ...overrides,
});

const company = (digit: string, createdAt = OLDER, name = 'BMG Advisors') => ({
  id: uuid(digit),
  name,
  createdAt,
});

const planFor = (
  companies: readonly { id: string; name: string; createdAt?: string }[],
  probes: Record<string, Record<string, unknown>>,
  names: readonly string[] = ['BMG Advisors'],
) => {
  const groups = findDuplicateCompanyGroups({ companies, names });

  return buildDuplicateCompanyResolutionPlan({
    groups,
    linkSummaries: groups.flatMap(({ companies: members }) =>
      members.map((member) =>
        summarizeCompanyLinks({
          companyId: member.id,
          record: probes[member.id] ?? probeRecord(member.id),
        }),
      ),
    ),
  });
};

test('a company with no populated relation reads as empty', () => {
  const summary = summarizeCompanyLinks({
    companyId: uuid('4'),
    record: probeRecord(uuid('4')),
  });

  assert.deepEqual(summary.linkedFieldNames, []);
  assert.deepEqual(summary.missingProbeFields, []);
});

test('composite columns are values on the company, never links', () => {
  const summary = summarizeCompanyLinks({
    companyId: uuid('4'),
    record: probeRecord(uuid('4'), {
      // Every one of these is an object or a scalar that belongs to the
      // company itself; counting any of them would block every removal.
      address: { addressCity: 'Kansas City', addressStreet1: '1 Main' },
      domainName: { primaryLinkUrl: 'https://bmg.example', secondaryLinks: [] },
      annualRecurringRevenue: { amountMicros: 0, currencyCode: 'USD' },
      createdBy: { source: 'API', workspaceMemberId: uuid('9'), name: 'Nash' },
      employees: 12,
      idealCustomerProfile: false,
      deletedAt: null,
      updatedAt: NEWER,
    }),
  });

  assert.deepEqual(summary.linkedFieldNames, []);
});

test('the company audit trail is not a link to another record', () => {
  const summary = summarizeCompanyLinks({
    companyId: uuid('4'),
    record: probeRecord(uuid('4'), {
      // Every company has one the moment it exists, the freshly minted
      // duplicate included, so counting it would block every group.
      timelineActivities: [{ id: uuid('7') }, { id: uuid('8') }],
    }),
  });

  assert.deepEqual(summary.linkedFieldNames, []);
});

test('a populated relation, a connection, and a foreign key all count as links', () => {
  const summary = summarizeCompanyLinks({
    companyId: uuid('4'),
    record: probeRecord(uuid('4'), {
      outreachActivities: [{ id: uuid('7') }],
      meetings: { edges: [{ node: { id: uuid('8') } }] },
      accountOwnerId: uuid('9'),
      // Not enumerated anywhere: a custom object added later still counts.
      corgiAllocationsUnknownToThisCode: [{ id: uuid('a') }],
    }),
  });

  assert.deepEqual(summary.linkedFieldNames, [
    'accountOwnerId',
    'corgiAllocationsUnknownToThisCode',
    'meetings',
    'outreachActivities',
  ]);
});

test('a probe that cannot see a required relation reports it as unseen', () => {
  const record = probeRecord(uuid('4'));
  delete record.outreachActivities;
  delete record.meetingBookings;

  const summary = summarizeCompanyLinks({ companyId: uuid('4'), record });

  assert.deepEqual(summary.missingProbeFields, [
    'meetingBookings',
    'outreachActivities',
  ]);
});

test('a probe answering for a different record is rejected', () => {
  assert.throws(
    () =>
      summarizeCompanyLinks({
        companyId: uuid('4'),
        record: probeRecord(uuid('5')),
      }),
    /returned a different record/,
  );
});

test('a single record is not a duplicate group', () => {
  const plan = planFor([company('4')], {});

  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.removals, []);
  assert.equal(plan.blockedGroupCount, 0);
});

test('an empty exact-name duplicate is removed and the linked record survives', () => {
  const older = company('4', OLDER);
  const newer = company('5', NEWER);
  const plan = planFor([older, newer], {
    [older.id]: probeRecord(older.id, {
      outreachActivities: [{ id: uuid('7') }, { id: uuid('8') }],
    }),
  });

  assert.deepEqual(
    plan.removals.map(({ companyId }) => companyId),
    [newer.id],
  );
  assert.deepEqual(plan.resolvedNames, ['BMG Advisors']);
  assert.equal(plan.blockedGroupCount, 0);
  const retained = plan.groups[0]?.records.find(
    ({ decision }) => decision === 'retain-linked',
  );
  assert.equal(retained?.companyId, older.id);
  assert.deepEqual(retained?.linkedFieldNames, ['outreachActivities']);
  assert.match(retained?.reason ?? '', /carries linked records/);
});

test('the linked record survives even when it is the newer of the pair', () => {
  const olderEmpty = company('4', OLDER);
  const newerLinked = company('5', NEWER);
  const plan = planFor([olderEmpty, newerLinked], {
    [newerLinked.id]: probeRecord(newerLinked.id, {
      people: [{ id: uuid('7') }],
    }),
  });

  // Emptiness dominates recency: the empty older record goes, history stays.
  assert.deepEqual(
    plan.removals.map(({ companyId }) => companyId),
    [olderEmpty.id],
  );
  assert.equal(
    plan.groups[0]?.records.find(({ decision }) => decision === 'retain-linked')
      ?.companyId,
    newerLinked.id,
  );
});

test('two empty duplicates keep the older and remove the most recently created', () => {
  const older = company('4', OLDER);
  const newer = company('5', NEWER);
  const plan = planFor([newer, older], {});

  assert.deepEqual(
    plan.removals.map(({ companyId }) => companyId),
    [newer.id],
  );
  const retained = plan.groups[0]?.records.find(
    ({ decision }) => decision === 'retain-oldest',
  );
  assert.equal(retained?.companyId, older.id);
  assert.match(
    plan.removals[0]?.reason ?? '',
    /no linked records and newer than the retained record/,
  );
});

test('two duplicates that both carry links are blocked for a human', () => {
  const first = company('4', OLDER);
  const second = company('5', NEWER);
  const plan = planFor([first, second], {
    [first.id]: probeRecord(first.id, { outreachActivities: [{ id: uuid('7') }] }),
    [second.id]: probeRecord(second.id, { meetings: [{ id: uuid('8') }] }),
  });

  assert.deepEqual(plan.removals, []);
  assert.deepEqual(plan.resolvedNames, []);
  assert.equal(plan.blockedGroupCount, 1);
  assert.equal(plan.groups[0]?.blocked, true);
  assert.match(plan.groups[0]?.blockedReason ?? '', /2 of 2 duplicates carry linked records/);
  assert.deepEqual(
    plan.groups[0]?.records.map(({ decision }) => decision),
    ['blocked', 'blocked'],
  );
});

test('a probe that cannot see every relation blocks the group instead of removing', () => {
  const older = company('4', OLDER);
  const newer = company('5', NEWER);
  const blind = probeRecord(newer.id);
  delete blind.outreachActivities;

  const plan = planFor([older, newer], { [newer.id]: blind });

  // An unseen relation must never read as "no links".
  assert.deepEqual(plan.removals, []);
  assert.equal(plan.blockedGroupCount, 1);
  assert.match(
    plan.groups[0]?.blockedReason ?? '',
    /link probe could not see outreachActivities/,
  );
});

test('an unreadable creation date blocks a group that only recency could settle', () => {
  const plan = planFor(
    [company('4', OLDER), { id: uuid('5'), name: 'BMG Advisors' }],
    {},
  );

  assert.deepEqual(plan.removals, []);
  assert.match(
    plan.groups[0]?.blockedReason ?? '',
    /no readable creation date/,
  );
});

test('an unreadable creation date is irrelevant when links pick the survivor', () => {
  const linked = company('4', OLDER);
  const undated = { id: uuid('5'), name: 'BMG Advisors' };
  const plan = planFor([linked, undated], {
    [linked.id]: probeRecord(linked.id, { people: [{ id: uuid('7') }] }),
  });

  assert.deepEqual(
    plan.removals.map(({ companyId }) => companyId),
    [undated.id],
  );
});

test('duplicate resolution never leaves a group without a survivor', () => {
  const plan = planFor(
    [company('4', OLDER), company('5', NEWER), company('6', NEWER)],
    {},
  );

  assert.equal(plan.groups[0]?.recordCount, 3);
  assert.equal(plan.removals.length, 2);
  assert.equal(
    plan.groups[0]?.records.filter(({ decision }) =>
      decision.startsWith('retain'),
    ).length,
    1,
  );
});

test('a repeated company ID means the listing is unstable and nothing may be removed', () => {
  assert.throws(
    () =>
      findDuplicateCompanyGroups({
        companies: [company('4'), company('4')],
        names: ['BMG Advisors'],
      }),
    /unstable company snapshot/,
  );
});

test('duplicate resolution only looks at the names this import needs', () => {
  const groups = findDuplicateCompanyGroups({
    companies: [
      company('4', OLDER, 'Elsewhere Capital'),
      company('5', NEWER, 'Elsewhere Capital'),
      company('6', OLDER),
      company('7', NEWER),
    ],
    names: ['BMG Advisors'],
  });

  assert.deepEqual(
    groups.map(({ name }) => name),
    ['BMG Advisors'],
  );
});

test('resolving a duplicate makes the very next run a no-op', () => {
  const older = company('4', OLDER);
  const newer = company('5', NEWER);
  const first = planFor([older, newer], {});
  const removed = new Set(first.removals.map(({ companyId }) => companyId));

  const second = planFor(
    [older, newer].filter(({ id }) => !removed.has(id)),
    {},
  );

  assert.equal(first.removals.length, 1);
  assert.deepEqual(second.removals, []);
  assert.deepEqual(second.groups, []);
});
