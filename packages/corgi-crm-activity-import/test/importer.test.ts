import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  assertTerritoryIdentityArtifact,
  buildActivityImportPlan,
  deterministicActivityId,
  parseActivityCsv,
  type ActivityImportCsvOptions,
  type OutreachActivityRecord,
} from '../src/importer.ts';

const uuid = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

const identities = {
  Grace: uuid('1'),
  Kelly: uuid('2'),
  Nash: uuid('3'),
};

const identityArtifact = {
  workspaceMemberIds: identities,
  aggregateIdentityHash: createHash('sha256')
    .update(
      `Grace=${identities.Grace}\nKelly=${identities.Kelly}\nNash=${identities.Nash}`,
      'utf8',
    )
    .digest('hex'),
};

const source = Buffer.from(
  '"Acme, Inc.",555,Website,LinkedIn,a@example.com,Alice,$1M,"Called,\nleft voicemail",extra,\r\n' +
    'Beta,,,,,,,,,\r\n',
  'utf8',
);

const options = (overrides: Partial<ActivityImportCsvOptions> = {}) => ({
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  expectedRows: 2,
  activityDate: '2026-09-09',
  timeZone: 'America/Chicago',
  importId: 'nash-calls-2026-09-09',
  ...overrides,
});

test('parses quoted multiline headerless rows and preserves blank activities', () => {
  const rows = parseActivityCsv(source, options());

  assert.deepEqual(rows, [
    {
      rowNumber: 1,
      companyName: 'Acme, Inc.',
      notes: 'Called,\nleft voicemail',
      occurredAt: '2026-09-09T17:00:00.000Z',
    },
    {
      rowNumber: 2,
      companyName: 'Beta',
      notes: null,
      occurredAt: '2026-09-09T17:00:01.000Z',
    },
  ]);
});

test('rejects a changed source, wrong row count, malformed width, and invalid timezone', () => {
  assert.throws(
    () => parseActivityCsv(source, options({ sourceSha256: '0'.repeat(64) })),
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
    notes: 'Called,\nleft voicemail',
  });
  assert.equal(plan.activities[1]?.record.notes, null);
  assert.ok(!('contactId' in plan.activities[0]!.record));
  assert.ok(!('outcome' in plan.activities[0]!.record));
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
  assert.equal(manifest.blankNoteCount, 1);
  assert.equal(manifest.distinctCompanyCount, 2);
  assert.doesNotMatch(serialized, /Acme|Beta|voicemail|555|a@example/);
  for (const hash of [
    manifest.sourceSha256,
    manifest.importIdHash,
    manifest.activityIdSetHash,
    manifest.planHash,
  ]) {
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});
