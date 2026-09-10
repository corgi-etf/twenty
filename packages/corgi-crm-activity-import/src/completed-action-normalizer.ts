import { createHash } from 'node:crypto';

import { activityCsvRowSequenceSha256 } from './importer.ts';

export type CompletedActionWorksheetRow = {
  sourceRowNumber: number;
  companyName: string;
  phoneCallCompleted: boolean;
  voicemail: boolean;
  emailFound: boolean;
  emailSent: boolean;
  notes: string | null;
};

export type CompletedActionNormalizationReceipt = {
  schemaVersion: 1;
  sourceFormat: 'completed-actions-v2';
  sourceDocumentSha256: string;
  normalizedCsvSha256: string;
  rowSequenceSha256: string;
  sourceRowCount: number;
  activityCount: number;
  phoneCallCount: number;
  voicemailCount: number;
  emailCount: number;
};

type CompletedActionNormalizationExpectations = {
  sourceDocumentSha256: string;
  sourceRowCount: number;
  activityCount: number;
  phoneCallCount: number;
  voicemailCount: number;
  emailCount: number;
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const csvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Completed action ${label} is invalid`);
  }
};

export const normalizeCompletedActionRows = (input: {
  sourceDocument: Uint8Array;
  rows: readonly CompletedActionWorksheetRow[];
  expectations: CompletedActionNormalizationExpectations;
}): {
  normalizedCsv: Uint8Array;
  receipt: CompletedActionNormalizationReceipt;
} => {
  const { expectations } = input;
  if (!HASH_PATTERN.test(expectations.sourceDocumentSha256)) {
    throw new Error('Completed action source document SHA-256 is invalid');
  }
  if (sha256(input.sourceDocument) !== expectations.sourceDocumentSha256) {
    throw new Error('Completed action source document SHA-256 mismatch');
  }
  for (const [label, value] of [
    ['source row count', expectations.sourceRowCount],
    ['activity count', expectations.activityCount],
    ['phone call count', expectations.phoneCallCount],
    ['voicemail count', expectations.voicemailCount],
    ['email count', expectations.emailCount],
  ] as const) {
    assertCount(value, label);
  }
  if (input.rows.length !== expectations.sourceRowCount) {
    throw new Error('Completed action source row count mismatch');
  }

  const actionRows: string[][] = [];
  let phoneCallCount = 0;
  let voicemailCount = 0;
  let emailCount = 0;
  for (const [index, row] of input.rows.entries()) {
    if (
      row.sourceRowNumber !== index + 1 ||
      !Number.isSafeInteger(row.sourceRowNumber)
    ) {
      throw new Error('Completed action source rows are not sequential');
    }
    const companyName = row.companyName.trim().normalize('NFKC');
    if (!companyName) {
      throw new Error(
        `Completed action source row ${index + 1} has no company`,
      );
    }
    if (
      ![
        row.phoneCallCompleted,
        row.voicemail,
        row.emailFound,
        row.emailSent,
      ].every((value) => typeof value === 'boolean') ||
      (row.notes !== null && typeof row.notes !== 'string')
    ) {
      throw new Error(`Completed action source row ${index + 1} is invalid`);
    }
    if (row.voicemail && !row.phoneCallCompleted) {
      throw new Error(
        `Completed action source row ${index + 1} has voicemail without a completed phone call`,
      );
    }
    const notes = row.notes?.trim().normalize('NFKC') ?? '';
    let actionOrdinal = 0;
    if (row.phoneCallCompleted) {
      actionOrdinal += 1;
      phoneCallCount += 1;
      if (row.voicemail) voicemailCount += 1;
      actionRows.push([
        String(row.sourceRowNumber),
        String(actionOrdinal),
        companyName,
        'phone_call',
        row.voicemail ? 'left_voicemail' : 'connected',
        notes,
      ]);
    }
    if (row.emailSent) {
      actionOrdinal += 1;
      emailCount += 1;
      actionRows.push([
        String(row.sourceRowNumber),
        String(actionOrdinal),
        companyName,
        'email',
        'no_response',
        notes,
      ]);
    }
  }

  if (actionRows.length !== expectations.activityCount) {
    throw new Error('Completed action activity count mismatch');
  }
  if (phoneCallCount !== expectations.phoneCallCount) {
    throw new Error('Completed action phone call count mismatch');
  }
  if (voicemailCount !== expectations.voicemailCount) {
    throw new Error('Completed action voicemail count mismatch');
  }
  if (emailCount !== expectations.emailCount) {
    throw new Error('Completed action email count mismatch');
  }

  const normalizedCsv = Buffer.from(
    `${actionRows.map((row) => row.map(csvField).join(',')).join('\n')}\n`,
    'utf8',
  );
  const receipt: CompletedActionNormalizationReceipt = {
    schemaVersion: 1,
    sourceFormat: 'completed-actions-v2',
    sourceDocumentSha256: expectations.sourceDocumentSha256,
    normalizedCsvSha256: sha256(normalizedCsv),
    rowSequenceSha256: activityCsvRowSequenceSha256(normalizedCsv),
    sourceRowCount: input.rows.length,
    activityCount: actionRows.length,
    phoneCallCount,
    voicemailCount,
    emailCount,
  };

  return { normalizedCsv, receipt };
};
