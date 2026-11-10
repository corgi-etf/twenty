import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APPROVED_CRM_ORIGIN } from '../src/constants.ts';
import { TwentyImportClient } from '../src/twenty-client.ts';

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('reads every normalized CRM holding page without mutation methods', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    json({
      data: {
        thirteenFHoldings: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            managerName: 'Alpine Capital',
          },
        ],
      },
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    }),
    json({
      data: {
        thirteenFHoldings: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            managerName: 'Beacon Capital',
          },
        ],
      },
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  ];
  const client = new TwentyImportClient({
    origin: APPROVED_CRM_ORIGIN,
    token: 'short-lived-read-token',
    sleep: async () => undefined,
    fetcher: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return responses.shift()!;
    },
  });

  const rows = await client.listHoldings();

  assert.deepEqual(
    rows.map(({ id }) => id),
    [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ],
  );
  assert.equal(requests.length, 2);
  const firstUrl = new URL(requests[0]!.url);
  assert.equal(firstUrl.pathname, '/rest/thirteenFHoldings');
  assert.equal(firstUrl.searchParams.get('limit'), '100');
  assert.equal(firstUrl.searchParams.get('depth'), '1');
  assert.equal(
    new URL(requests[1]!.url).searchParams.get('starting_after'),
    'cursor-1',
  );
  assert.ok(
    requests.every(
      ({ init }) =>
        init.method === 'GET' &&
        new Headers(init.headers).get('authorization') ===
          'Bearer short-lived-read-token',
    ),
  );
  assert.equal('createFileUpload' in client, false);
  assert.equal('upsertBatch' in client, false);
  assert.equal('patchMany' in client, false);
});

test('rejects noncanonical CRM origins before any request', () => {
  assert.throws(
    () =>
      new TwentyImportClient({
        origin: 'https://crm-lookalike.example',
        token: 'short-lived-read-token',
      }),
    /origin is not approved/,
  );
});
