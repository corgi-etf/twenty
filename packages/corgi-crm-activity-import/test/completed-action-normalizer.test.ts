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

const worksheetRows = Array.from({ length: 36 }, (_, index) => {
  const sourceRowNumber = index + 1;

  return {
    sourceRowNumber,
    companyName: `Synthetic Company ${sourceRowNumber}`,
    phoneCallCompleted: sourceRowNumber <= 23,
    voicemail: sourceRowNumber <= 13,
    emailFound: sourceRowNumber >= 24,
    emailSent: sourceRowNumber === 24 || sourceRowNumber === 25,
    notes:
      sourceRowNumber === 23
        ? 'Took down my email, number'
        : sourceRowNumber === 24
          ? 'emailed and followed on Linkedin'
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
    activities.filter(({ activityType }) => activityType === 'email').length,
    2,
  );
  assert.deepEqual(
    activities
      .slice(22, 25)
      .map(
        ({ sourceRowNumber, actionOrdinal, activityType, outcome, notes }) => ({
          sourceRowNumber,
          actionOrdinal,
          activityType,
          outcome,
          notes,
        }),
      ),
    [
      {
        sourceRowNumber: 23,
        actionOrdinal: 1,
        activityType: 'phone_call',
        outcome: 'connected',
        notes: 'Took down my email, number',
      },
      {
        sourceRowNumber: 24,
        actionOrdinal: 1,
        activityType: 'email',
        outcome: 'no_response',
        notes: 'emailed and followed on Linkedin',
      },
      {
        sourceRowNumber: 25,
        actionOrdinal: 1,
        activityType: 'email',
        outcome: 'no_response',
        notes: null,
      },
    ],
  );
  assert.ok(
    activities.every(({ sourceRowNumber }) => sourceRowNumber < 26),
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
    /Synthetic Company|Took down|Linkedin/,
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
        ...worksheetRows.slice(0, 25),
        { ...worksheetRows[25]!, voicemail: true },
        ...worksheetRows.slice(26),
      ]),
    /voicemail without a completed phone call/,
  );
  assert.throws(
    () => normalize(worksheetRows, { activityCount: 24 }),
    /activity count mismatch/,
  );
});
