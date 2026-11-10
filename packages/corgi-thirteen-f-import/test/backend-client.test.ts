import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  BackendIngestionClient,
  canonicalJson,
} from '../src/backend-client.ts';
import type { NormalizedDataset } from '../src/ingestion-contract.ts';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

test('submits deterministic idempotent begin, chunk, and complete requests', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    {
      batchId: 'batch-id',
      batchKey: 'legacy-abc',
      status: 'RECEIVING',
      nextSequence: 0,
      receivedCounts: {
        managers: 0,
        filings: 0,
        securities: 0,
        holdings: 0,
        chunks: 0,
      },
    },
    { status: 'RECEIVING', nextSequence: 1 },
    {
      batchId: 'batch-id',
      batchKey: 'legacy-abc',
      status: 'COMPLETED',
      receivedCounts: {
        managers: 1,
        filings: 1,
        securities: 1,
        holdings: 1,
        chunks: 1,
      },
      published: { managers: 1, filings: 1, securities: 1, holdings: 1 },
      completedAt: '2026-11-10T12:00:00.000Z',
    },
  ];
  const client = new BackendIngestionClient({
    origin: 'https://admin.corgiinvest.com',
    token: 'github-oidc-token',
    fetcher: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const dataset: NormalizedDataset = {
    managers: [{ sourceKey: 'manager:1', legalName: 'Alpine Capital' }],
    filings: [
      {
        sourceKey: 'filing:1',
        managerSourceKey: 'manager:1',
        legacyAsOfDate: '2026-09-30',
        dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
      },
    ],
    securities: [{ sourceKey: 'security:1', ticker: 'TQQQ' }],
    holdings: [
      {
        rowKey: 'holding:1',
        filingSourceKey: 'filing:1',
        securitySourceKey: 'security:1',
        sharesOrPrincipal: '1250',
        legacyContext: {
          portfolioName: 'Growth Strategy',
          targetTicker: 'CORG',
          latestChange: '-25',
          estimatedValue: '125000',
        },
      },
    ],
  };

  const receipt = await client.ingestLegacyDataset({
    batchKey: 'legacy-abc',
    dataset,
    chunkSize: 250,
  });

  assert.equal(receipt.status, 'COMPLETED');
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      'https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions/legacy-abc/begin',
      'https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions/legacy-abc/chunks',
      'https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions/legacy-abc/complete',
    ],
  );
  assert.ok(
    requests.every(
      ({ init }) =>
        new Headers(init.headers).get('authorization') ===
        'Bearer github-oidc-token',
    ),
  );
  const begin = JSON.parse(String(requests[0]?.init.body));
  const chunk = JSON.parse(String(requests[1]?.init.body));
  const complete = JSON.parse(String(requests[2]?.init.body));
  assert.deepEqual(begin, {
    sourceSystem: 'LEGACY_NORMALIZED',
    coverage: 'PARTIAL',
    contentSha256: sha256(canonicalJson(dataset)),
    expected: {
      managers: 1,
      filings: 1,
      securities: 1,
      holdings: 1,
      chunks: 1,
    },
  });
  assert.equal(chunk.sequence, 0);
  assert.equal(
    chunk.chunkSha256,
    sha256(
      canonicalJson({
        managers: dataset.managers,
        filings: dataset.filings,
        securities: dataset.securities,
        holdings: dataset.holdings,
      }),
    ),
  );
  assert.deepEqual(complete, {
    contentSha256: begin.contentSha256,
    expected: begin.expected,
  });
});

test('returns an exact completed begin replay without posting chunks again', async () => {
  const requests: string[] = [];
  const completed = {
    batchId: 'batch-id',
    batchKey: 'legacy-abc',
    status: 'COMPLETED',
    receivedCounts: {
      managers: 1,
      filings: 1,
      securities: 1,
      holdings: 1,
      chunks: 1,
    },
    published: { managers: 1, filings: 1, securities: 1, holdings: 1 },
    completedAt: '2026-11-10T12:00:00.000Z',
  };
  const client = new BackendIngestionClient({
    origin: 'https://admin.corgiinvest.com',
    token: 'github-oidc-token',
    fetcher: async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify(completed));
    },
  });
  const dataset: NormalizedDataset = {
    managers: [{ sourceKey: 'manager:1', legalName: 'Alpine Capital' }],
    filings: [
      {
        sourceKey: 'filing:1',
        managerSourceKey: 'manager:1',
        legacyAsOfDate: '2026-09-30',
        dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
      },
    ],
    securities: [{ sourceKey: 'security:1', ticker: 'TQQQ' }],
    holdings: [
      {
        rowKey: 'holding:1',
        filingSourceKey: 'filing:1',
        securitySourceKey: 'security:1',
        sharesOrPrincipal: '1250',
      },
    ],
  };

  const receipt = await client.ingestLegacyDataset({
    batchKey: 'legacy-abc',
    dataset,
  });

  assert.deepEqual(receipt, completed);
  assert.deepEqual(requests, [
    'https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions/legacy-abc/begin',
  ]);
});

test('resumes a receiving batch from the persisted next sequence', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const responses = [
    {
      batchId: 'batch-id',
      batchKey: 'legacy-abc',
      status: 'RECEIVING',
      nextSequence: 1,
      receivedCounts: {
        managers: 1,
        filings: 1,
        securities: 0,
        holdings: 0,
        chunks: 1,
      },
    },
    {
      batchId: 'batch-id',
      batchKey: 'legacy-abc',
      status: 'RECEIVING',
      nextSequence: 2,
      receivedCounts: {
        managers: 1,
        filings: 1,
        securities: 1,
        holdings: 1,
        chunks: 2,
      },
    },
    {
      batchId: 'batch-id',
      batchKey: 'legacy-abc',
      status: 'COMPLETED',
      receivedCounts: {
        managers: 1,
        filings: 1,
        securities: 1,
        holdings: 1,
        chunks: 2,
      },
      published: { managers: 1, filings: 1, securities: 1, holdings: 1 },
      completedAt: '2026-11-10T12:00:00.000Z',
    },
  ];
  const client = new BackendIngestionClient({
    origin: 'https://admin.corgiinvest.com',
    token: 'github-oidc-token',
    fetcher: async (input, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(responses.shift()));
    },
  });
  const dataset: NormalizedDataset = {
    managers: [{ sourceKey: 'manager:1', legalName: 'Alpine Capital' }],
    filings: [
      {
        sourceKey: 'filing:1',
        managerSourceKey: 'manager:1',
        legacyAsOfDate: '2026-09-30',
        dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
      },
    ],
    securities: [{ sourceKey: 'security:1', ticker: 'TQQQ' }],
    holdings: [
      {
        rowKey: 'holding:1',
        filingSourceKey: 'filing:1',
        securitySourceKey: 'security:1',
        sharesOrPrincipal: '1250',
      },
    ],
  };

  await client.ingestLegacyDataset({
    batchKey: 'legacy-abc',
    dataset,
    chunkSize: 2,
  });

  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map(({ url }) => url.split('/').slice(-1)[0]),
    ['begin', 'chunks', 'complete'],
  );
  assert.equal(requests[1]?.body.sequence, 1);
});
