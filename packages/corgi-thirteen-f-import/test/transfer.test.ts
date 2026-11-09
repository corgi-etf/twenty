import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { APPROVED_EXPORT_ENDPOINT, SOURCE_DRIVE_ID } from '../src/constants.ts';
import {
  assertExportManifest,
  computeManifestSha256,
  type ExportManifestContract,
} from '../src/manifest.ts';
import {
  downloadExportFiles,
  exchangeOidcForExport,
  requestGitHubOidcToken,
} from '../src/transfer.ts';

const sourceBytes = Array.from({ length: 25 }, (_, index) =>
  Buffer.from(`source-${index}`),
);
const sourceHost =
  'etfsite-production-files-182018075072.s3.us-east-2.amazonaws.com';
const rawFiles = sourceBytes.map((bytes, index) => {
  const id = randomUUID();
  const sourceVersionId = `version-${index}`;
  const downloadUrl = new URL(
    `https://${sourceHost}/production/${SOURCE_DRIVE_ID}/${id}`,
  );
  downloadUrl.searchParams.set('versionId', sourceVersionId);

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
    sizeBytes: bytes.byteLength,
    sourceVersionId,
    updatedAt: '2026-11-08T12:00:00.000Z',
    downloadUrl: downloadUrl.toString(),
  };
});
const contract: ExportManifestContract = {
  fileCount: 25,
  totalBytes: sourceBytes.reduce((sum, bytes) => sum + bytes.byteLength, 0),
  manifestSha256: computeManifestSha256(rawFiles),
  xlsxCount: 24,
  pdfCount: 1,
  tickerCount: 20,
  maximumFileBytes: 1024,
};
const rawManifest = {
  returned: 25,
  totalBytes: contract.totalBytes,
  manifestSha256: contract.manifestSha256,
  expiresInSeconds: 300,
  expiresAt: '2026-11-09T18:05:00.000Z',
  files: rawFiles,
};

test('requests a GitHub OIDC token for only the exact export audience', async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const masked: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      authorization: headers.get('authorization'),
    });

    return new Response(JSON.stringify({ value: 'header.payload.signature' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const token = await requestGitHubOidcToken(
    fetcher,
    {
      requestUrl:
        'https://pipelines.actions.githubusercontent.com/token?api-version=2.0',
      requestToken: 'github-request-token',
    },
    (value) => masked.push(value),
  );

  assert.equal(token, 'header.payload.signature');
  assert.deepEqual(masked, ['github-request-token', token]);
  assert.equal(calls[0]?.authorization, 'Bearer github-request-token');
  assert.equal(
    new URL(calls[0]?.url ?? '').searchParams.get('audience'),
    APPROVED_EXPORT_ENDPOINT,
  );
});

test('rejects non-GitHub OIDC request endpoints before making a request', async () => {
  let called = false;
  await assert.rejects(
    requestGitHubOidcToken(
      async () => {
        called = true;
        return new Response();
      },
      {
        requestUrl: 'https://lookalike.example/token',
        requestToken: 'token',
      },
      () => undefined,
    ),
    /OIDC environment is invalid/,
  );
  assert.equal(called, false);
});

test('exchanges OIDC only at the fixed endpoint and masks every URL immediately', async () => {
  const masked: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), APPROVED_EXPORT_ENDPOINT);
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer oidc-token',
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      acknowledgement: 'COPY_25_TONY_SALES_FILES_TO_CRM',
      expectedManifestSha256: contract.manifestSha256,
    });

    return new Response(JSON.stringify(rawManifest), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const manifest = await exchangeOidcForExport(
    fetcher,
    'oidc-token',
    (value) => masked.push(value),
    new Date('2026-11-09T18:00:00.000Z'),
    contract,
  );

  assert.equal(manifest.files.length, 25);
  assert.equal(masked[0], 'oidc-token');
  assert.deepEqual(
    new Set(masked.slice(1)),
    new Set(rawFiles.map(({ downloadUrl }) => downloadUrl)),
  );
});

test('downloads at most four files concurrently and verifies every byte count and hash', async () => {
  const manifest = assertExportManifest(rawManifest, {
    now: new Date('2026-11-09T18:00:00.000Z'),
    contract,
  });
  let active = 0;
  let maximumActive = 0;
  const fetcher: typeof fetch = async (input) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await Promise.resolve();
    const index = rawFiles.findIndex(
      ({ downloadUrl }) => downloadUrl === String(input),
    );
    const bytes = sourceBytes[index];
    assert.ok(bytes);
    active -= 1;

    return new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.byteLength) },
    });
  };

  const downloaded = await downloadExportFiles(fetcher, manifest);

  assert.equal(maximumActive, 4);
  assert.equal(downloaded.length, 25);
  assert.ok(downloaded[0]);
  assert.equal(
    downloaded[0].contentSha256,
    createHash('sha256').update(downloaded[0].bytes).digest('hex'),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(downloaded[0], 'downloadUrl'),
    false,
  );
});

test('aborts all writes when a source response does not match its declared size', async () => {
  const manifest = assertExportManifest(rawManifest, {
    now: new Date('2026-11-09T18:00:00.000Z'),
    contract,
  });

  await assert.rejects(
    downloadExportFiles(
      async () => new Response(Buffer.from('wrong-size'), { status: 200 }),
      manifest,
    ),
    /source download verification failed/,
  );
});
