import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  normalizeCompletedActionRows,
  type CompletedActionWorksheetRow,
} from '../src/completed-action-normalizer.ts';
import { parseActivityCsv } from '../src/importer.ts';

const document = Buffer.from('synthetic completed-action document');
const documentSha256 = createHash('sha256').update(document).digest('hex');
const voicemailRows = new Set([
  2, 5, 10, 11, 14, 15, 16, 17, 18, 20, 21, 22, 23,
]);
const emailRows = new Set([2, 5]);

const worksheetRows = Array.from({ length: 36 }, (_, index) => {
  const sourceRowNumber = index + 1;

  return {
    sourceRowNumber,
    companyName: `Synthetic Company ${sourceRowNumber}`,
    phoneCallCompleted: sourceRowNumber <= 23,
    voicemail: voicemailRows.has(sourceRowNumber),
    spokeWith: false,
    emailFound: sourceRowNumber >= 24,
    emailSent: emailRows.has(sourceRowNumber),
    notes:
      sourceRowNumber === 2
        ? 'Shared contact details'
        : sourceRowNumber === 5
          ? 'Sent a message; social follow noted'
          : null,
  } satisfies CompletedActionWorksheetRow;
});

const normalize = (
  rows: CompletedActionWorksheetRow[] = worksheetRows,
  overrides = {},
) =>
  normalizeCompletedActionRows({
    sourceDocument: document,
    rows,
    expectations: {
      sourceDocumentSha256: documentSha256,
      sourceRowCount: 36,
      activityCount: 25,
      phoneCallCount: 23,
      voicemailCount: 13,
      emailCount: 2,
      ...overrides,
    },
  });

test('normalizes only checked completed actions in deterministic order', () => {
  const normalized = normalize();
  const activities = parseActivityCsv(normalized.normalizedCsv, {
    sourceFormat: 'completed-actions-v2',
    ownerLabel: 'Kelly',
    sourceSha256: normalized.receipt.normalizedCsvSha256,
    provenanceSha256: normalized.receipt.sourceDocumentSha256,
    expectedRowSequenceSha256: normalized.receipt.rowSequenceSha256,
    expectedRows: normalized.receipt.activityCount,
    activityDate: '2026-09-09',
    timeZone: 'America/Chicago',
    importId: 'completed-actions-synthetic',
    normalizationReceipt: normalized.receipt,
  });

  assert.equal(activities.length, 25);
  assert.equal(
    activities.filter(({ activityType }) => activityType === 'phone_call')
      .length,
    23,
  );
  assert.equal(
    activities.filter(({ outcome }) => outcome === 'left_voicemail').length,
    13,
  );
  assert.equal(
    activities.filter(({ outcome }) => outcome === 'no_response').length,
    10,
  );
  assert.equal(
    activities.filter(({ activityType }) => activityType === 'email').length,
    2,
  );
  assert.deepEqual(
    activities
      .filter(({ activityType }) => activityType === 'phone_call')
      .map(({ sourceRowNumber }) => sourceRowNumber),
    Array.from({ length: 23 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    activities
      .filter(({ outcome }) => outcome === 'left_voicemail')
      .map(({ sourceRowNumber }) => sourceRowNumber),
    [...voicemailRows],
  );
  assert.deepEqual(
    activities
      .filter(({ activityType }) => activityType === 'email')
      .map(({ sourceRowNumber }) => sourceRowNumber),
    [...emailRows],
  );
  assert.ok(worksheetRows.every(({ spokeWith }) => spokeWith === false));
  for (const sourceRowNumber of [2, 5]) {
    assert.deepEqual(
      activities
        .filter((activity) => activity.sourceRowNumber === sourceRowNumber)
        .map(
          ({
            sourceRowNumber,
            actionOrdinal,
            activityType,
            outcome,
            notes,
          }) => ({
            sourceRowNumber,
            actionOrdinal,
            activityType,
            outcome,
            notes,
          }),
        ),
      [
        {
          sourceRowNumber,
          actionOrdinal: 1,
          activityType: 'phone_call',
          outcome: 'left_voicemail',
          notes:
            sourceRowNumber === 2
              ? 'Shared contact details'
              : 'Sent a message; social follow noted',
        },
        {
          sourceRowNumber,
          actionOrdinal: 2,
          activityType: 'email',
          outcome: 'other',
          notes:
            sourceRowNumber === 2
              ? 'Shared contact details'
              : 'Sent a message; social follow noted',
        },
      ],
    );
  }
  assert.ok(
    worksheetRows
      .filter(({ emailSent }) => emailSent)
      .every(({ emailFound }) => emailFound === false),
    'Email Sent must stay independent from Email Found',
  );
  assert.ok(
    activities.every(({ sourceRowNumber }) => sourceRowNumber <= 23),
    'Email Found without a checked completed action must emit nothing',
  );
});

test('emits exact PII-free hashes and aggregate counts', () => {
  const { receipt } = normalize();

  assert.deepEqual(receipt, {
    schemaVersion: 1,
    sourceFormat: 'completed-actions-v2',
    sourceDocumentSha256: documentSha256,
    normalizedCsvSha256: receipt.normalizedCsvSha256,
    rowSequenceSha256: receipt.rowSequenceSha256,
    sourceRowCount: 36,
    activityCount: 25,
    phoneCallCount: 23,
    voicemailCount: 13,
    emailCount: 2,
  });
  assert.match(receipt.normalizedCsvSha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.rowSequenceSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /Synthetic Company|Shared contact|social follow/,
  );
});

test('emits connected only when spoke-with evidence is checked', () => {
  const { normalizedCsv } = normalize(
    [{ ...worksheetRows[0]!, spokeWith: true }],
    {
      sourceRowCount: 1,
      activityCount: 1,
      phoneCallCount: 1,
      voicemailCount: 0,
      emailCount: 0,
    },
  );

  assert.equal(
    new TextDecoder().decode(normalizedCsv),
    '1,1,Synthetic Company 1,phone_call,connected,\n',
  );
});

test('fails closed on changed provenance, invalid checkbox state, and count drift', () => {
  assert.throws(
    () => normalize(worksheetRows, { sourceDocumentSha256: '0'.repeat(64) }),
    /source document SHA-256 mismatch/,
  );
  assert.throws(
    () =>
      normalize([
        ...worksheetRows.slice(0, 23),
        { ...worksheetRows[23]!, voicemail: true },
        ...worksheetRows.slice(24),
      ]),
    /voicemail without a completed phone call/,
  );
  assert.throws(
    () =>
      normalize([
        ...worksheetRows.slice(0, 1),
        { ...worksheetRows[1]!, spokeWith: true },
        ...worksheetRows.slice(2),
      ]),
    /cannot both be voicemail and spoke with/,
  );
  assert.throws(
    () =>
      normalize([
        ...worksheetRows.slice(0, 23),
        { ...worksheetRows[23]!, spokeWith: true },
        ...worksheetRows.slice(24),
      ]),
    /spoke with without a completed phone call/,
  );
  assert.throws(
    () => normalize(worksheetRows, { activityCount: 24 }),
    /activity count mismatch/,
  );
  assert.throws(
    () =>
      normalize([{ ...worksheetRows[0]!, companyName: undefined as never }], {
        sourceRowCount: 1,
        activityCount: 1,
        phoneCallCount: 1,
        voicemailCount: 0,
        emailCount: 0,
      }),
    /source row 1 is invalid/,
  );
  assert.throws(
    () =>
      normalizeCompletedActionRows({
        sourceDocument: document,
        rows: [],
        expectations: {
          sourceDocumentSha256: documentSha256,
          sourceRowCount: 0,
          activityCount: 0,
          phoneCallCount: 0,
          voicemailCount: 0,
          emailCount: 0,
        },
      }),
    /source row count is invalid/,
  );
});
