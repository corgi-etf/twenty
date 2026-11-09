import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  assertExportManifest,
  computeManifestSha256,
  deriveTicker,
  type ExportManifestContract,
} from '../src/manifest.ts';
import { SOURCE_DRIVE_ID } from '../src/constants.ts';

const now = new Date('2026-11-09T18:00:00.000Z');

const sourceHost =
  'etfsite-production-files-182018075072.s3.us-east-2.amazonaws.com';
const sourceUrl = (id: string, versionId: string): string => {
  const url = new URL(
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${id}`,
  );
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('versionId', versionId);

  return url.toString();
};

const files = Array.from({ length: 25 }, (_, index) => {
  const id = randomUUID();
  const sourceVersionId = `version-${index}`;

  return {
    id,
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
    sourceVersionId,
    updatedAt: '2026-11-08T12:00:00.000Z',
    downloadUrl: sourceUrl(id, sourceVersionId),
  };
});

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
  files: files.map((file) => ({ ...file })),
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
  changed.files[0] = {
    ...changed.files[0]!,
    updatedAt: '2026-11-08T12:00:01.000Z',
  };

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

test('rejects signed URLs outside the exact version-pinned source object', () => {
  const original = files[0]!;
  const hostileUrls = [
    `https://attacker.example/production/${SOURCE_DRIVE_ID}/${original.id}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}.attacker.example/production/${SOURCE_DRIVE_ID}/${original.id}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${randomUUID()}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}/production/${randomUUID()}/${original.id}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}/staging/${SOURCE_DRIVE_ID}/${original.id}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${original.id}?versionId=wrong-version`,
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${original.id}`,
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${original.id}?versionId=${original.sourceVersionId}&versionId=${original.sourceVersionId}`,
    `https://${sourceHost}:444/production/${SOURCE_DRIVE_ID}/${original.id}?versionId=${original.sourceVersionId}`,
    `https://${sourceHost}/production%2F${SOURCE_DRIVE_ID}%2F${original.id}?versionId=${original.sourceVersionId}`,
  ];

  for (const downloadUrl of hostileUrls) {
    const value = response();
    value.files[0] = { ...original, downloadUrl };
    assert.throws(
      () => assertExportManifest(value, { now, contract: contract() }),
      /invalid download URL/,
      downloadUrl,
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
