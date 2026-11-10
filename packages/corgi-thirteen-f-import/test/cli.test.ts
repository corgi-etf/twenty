import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { localMasterSource } from '../src/cli.ts';

test('builds a stable local master source for convergent CRM attachment upload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'corgi-13f-master-'));
  const filename =
    'Competitor Holders (13F) - Thematic + Levered 20261109.xlsx';
  const filePath = join(directory, filename);
  const bytes = Buffer.from('sample workbook bytes');
  try {
    await writeFile(filePath, bytes);

    const first = await localMasterSource(filePath);
    const second = await localMasterSource(filePath);

    assert.equal(first.id, second.id);
    assert.equal(first.name, filename);
    assert.equal(first.ticker, null);
    assert.equal(first.sourceDriveId, null);
    assert.equal(first.sourceLink, null);
    assert.equal(first.sizeBytes, bytes.byteLength);
    assert.equal(
      first.contentSha256,
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.equal(first.sourceVersionId, first.contentSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects relative and non-master local workbook paths', async () => {
  await assert.rejects(
    localMasterSource('Competitor Holders (13F) 20261109.xlsx'),
    /must be absolute/,
  );
  await assert.rejects(
    localMasterSource('/tmp/not-a-master.xlsx'),
    /file name/,
  );
});
