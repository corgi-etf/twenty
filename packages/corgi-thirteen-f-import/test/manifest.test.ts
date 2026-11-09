import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  assertExportManifest,
  computeManifestSha256,
  deriveTicker,
  type ExportManifestContract,
} from '../src/manifest.ts';

const now = new Date('2026-11-09T18:00:00.000Z');

const files = Array.from({ length: 25 }, (_, index) => ({
  id: randomUUID(),
  name:
    index < 20
      ? `T${String(index).padStart(2, '0')} competitor holders.xlsx`
      : index === 24
        ? 'reference.pdf'
        : `other-${index}.xlsx`,
  contentType:
    index === 24
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 100 + index,
  sourceVersionId: `version-${index}`,
  updatedAt: '2026-11-08T12:00:00.000Z',
  downloadUrl: `https://download.example/file-${index}`,
}));

const contract = (): ExportManifestContract => ({
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
  manifestSha256: computeManifestSha256(files),
  xlsxCount: 24,
  pdfCount: 1,
  tickerCount: 20,
  maximumFileBytes: 1024,
});

const response = () => ({
  returned: files.length,
  totalBytes: contract().totalBytes,
  manifestSha256: contract().manifestSha256,
  expiresInSeconds: 300,
  expiresAt: '2026-11-09T18:05:00.000Z',
  files,
});

test('accepts only the exact canonical export manifest', () => {
  const manifest = assertExportManifest(response(), {
    now,
    contract: contract(),
  });

  assert.equal(manifest.files.length, 25);
  assert.equal(manifest.files.filter(({ ticker }) => ticker).length, 20);
  assert.equal(
    manifest.files.find(({ name }) => name.startsWith('T00 '))?.ticker,
    'T00',
  );
});

test('recomputes the digest instead of trusting the response field', () => {
  const changed = response();
  changed.files[0] = { ...changed.files[0]!, sourceVersionId: 'changed' };

  assert.throws(
    () => assertExportManifest(changed, { now, contract: contract() }),
    /manifest contract mismatch/,
  );
});

test('rejects duplicate IDs, mismatched sizes, unsafe URLs, and stale expiry', () => {
  const cases = [
    () => {
      const value = response();
      value.files[1] = { ...value.files[1]!, id: value.files[0]!.id };
      return value;
    },
    () => ({ ...response(), totalBytes: contract().totalBytes + 1 }),
    () => {
      const value = response();
      value.files[0] = {
        ...value.files[0]!,
        downloadUrl: 'http://unsafe/file',
      };
      return value;
    },
    () => ({ ...response(), expiresAt: now.toISOString() }),
  ];

  for (const createValue of cases) {
    assert.throws(
      () => assertExportManifest(createValue(), { now, contract: contract() }),
      /invalid|mismatch|expired/,
    );
  }
});

test('canonical digest excludes signed URLs and preserves version identity', () => {
  const left = computeManifestSha256(files);
  const right = computeManifestSha256(
    files.map((file) => ({
      ...file,
      downloadUrl: `${file.downloadUrl}?changed=1`,
    })),
  );
  const changedVersion = computeManifestSha256(
    files.map((file, index) =>
      index === 0 ? { ...file, sourceVersionId: 'new-version' } : file,
    ),
  );

  assert.equal(left, right);
  assert.notEqual(left, changedVersion);
  assert.match(left, /^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update('x').digest('hex').length, 64);
});

test('ticker derivation is narrow and uppercases only competitor-holder prefixes', () => {
  assert.equal(deriveTicker('aaab competitor holders.xlsx'), 'AAAB');
  assert.equal(deriveTicker('13F reference.pdf'), null);
  assert.equal(deriveTicker('holders.xlsx'), null);
  assert.equal(deriveTicker('../bad competitor holders.xlsx'), null);
});
