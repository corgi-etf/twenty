import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertCompletedMetadataCleanup } from '../src/cleanup-prerequisite.ts';

test('accepts only an integrity-protected completed cleanup with the exact count', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-cleanup-prerequisite-'));
  try {
    const path = join(directory, 'metadata-cleanup-journal.json');
    const journal = {
      schemaVersion: 1,
      status: 'complete',
      operations: [],
      completedOperationKeys: [],
      preflightEvidence: {
        companyCount: 2191,
        rowCoverageHash: 'a'.repeat(64),
        businessContentHash: 'b'.repeat(64),
      },
    };
    const sha256 = createHash('sha256')
      .update(JSON.stringify(journal), 'utf8')
      .digest('hex');
    await writeFile(path, JSON.stringify({ sha256, journal }), 'utf8');

    await assertCompletedMetadataCleanup({
      journalPath: path,
      expectedCompanyCount: 2191,
      expectedRowCoverageHash: 'a'.repeat(64),
      expectedBusinessContentHash: 'b'.repeat(64),
    });
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
