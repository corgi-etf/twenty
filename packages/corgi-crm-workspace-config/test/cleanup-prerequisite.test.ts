import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertCompletedMetadataCleanup } from '../src/cleanup-prerequisite.ts';

const COMPLETED_OPERATION = {
  key: 'delete-field:field-id',
  kind: 'delete-field',
  id: 'field-id',
  target: 'company.fetchMetadata',
};

const completedJournal = () => ({
  schemaVersion: 1,
  status: 'complete',
  operations: [COMPLETED_OPERATION],
  completedOperationKeys: [COMPLETED_OPERATION.key],
  preflightEvidence: {
    companyCount: 2191,
    rowCoverageHash: 'a'.repeat(64),
    businessContentHash: 'b'.repeat(64),
  },
});

const writeJournal = async (path: string, journal: unknown): Promise<void> => {
  const sha256 = createHash('sha256')
    .update(JSON.stringify(journal), 'utf8')
    .digest('hex');

  await writeFile(path, JSON.stringify({ sha256, journal }), 'utf8');
};

const assertJournalAccepted = (path: string): Promise<void> =>
  assertCompletedMetadataCleanup({
    journalPath: path,
    expectedCompanyCount: 2191,
    expectedRowCoverageHash: 'a'.repeat(64),
    expectedBusinessContentHash: 'b'.repeat(64),
  });

test('accepts only an integrity-protected completed cleanup with the exact evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-cleanup-prerequisite-'));
  try {
    const path = join(directory, 'metadata-cleanup-journal.json');
    await writeJournal(path, completedJournal());

    await assertJournalAccepted(path);
    await assert.rejects(
      assertCompletedMetadataCleanup({
        journalPath: path,
        expectedCompanyCount: 2192,
        expectedRowCoverageHash: 'a'.repeat(64),
        expectedBusinessContentHash: 'b'.repeat(64),
      }),
      /not complete and approved/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects duplicate cleanup operation and completion keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-cleanup-prerequisite-'));
  try {
    const path = join(directory, 'metadata-cleanup-journal.json');
    const duplicateOperationJournal = completedJournal();
    duplicateOperationJournal.operations.push(COMPLETED_OPERATION);
    duplicateOperationJournal.completedOperationKeys.push(
      COMPLETED_OPERATION.key,
    );
    await writeJournal(path, duplicateOperationJournal);

    await assert.rejects(assertJournalAccepted(path), /operation coverage/i);

    const duplicateCompletionJournal = completedJournal();
    duplicateCompletionJournal.completedOperationKeys.push(
      COMPLETED_OPERATION.key,
    );
    await writeJournal(path, duplicateCompletionJournal);

    await assert.rejects(assertJournalAccepted(path), /operation coverage/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects incomplete or unknown cleanup completion keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-cleanup-prerequisite-'));
  try {
    const path = join(directory, 'metadata-cleanup-journal.json');
    const incompleteJournal = completedJournal();
    incompleteJournal.completedOperationKeys = [];
    await writeJournal(path, incompleteJournal);

    await assert.rejects(assertJournalAccepted(path), /operation coverage/i);

    const unknownCompletionJournal = completedJournal();
    unknownCompletionJournal.completedOperationKeys = ['delete-field:other-id'];
    await writeJournal(path, unknownCompletionJournal);

    await assert.rejects(assertJournalAccepted(path), /operation coverage/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
