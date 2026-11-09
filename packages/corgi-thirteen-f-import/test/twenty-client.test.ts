import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  APPROVED_CRM_ORIGIN,
  THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
} from '../src/constants.ts';
import { TwentyImportClient } from '../src/twenty-client.ts';

type FetchCall = { url: string; init: RequestInit; atMilliseconds: number };

const createClient = (responses: Response[]) => {
  const calls: FetchCall[] = [];
  const sleeps: number[] = [];
  let currentMilliseconds = 0;
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      init,
      atMilliseconds: currentMilliseconds,
    });
    const response = responses.shift();
    assert.ok(response, 'missing fake response');

    return response;
  };

  return {
    calls,
    sleeps,
    client: new TwentyImportClient({
      fetcher,
      now: () => currentMilliseconds,
      origin: APPROVED_CRM_ORIGIN,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        currentMilliseconds += milliseconds;
      },
      token: 'short-lived-import-token',
    }),
  };
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('lists every 13F page with the short-lived bearer credential', async () => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  const { client, calls } = createClient([
    json({
      data: { thirteenFFilings: [{ id: firstId }] },
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    }),
    json({
      data: { thirteenFFilings: [{ id: secondId }] },
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  ]);

  const records = await client.listFilings();

  assert.deepEqual(
    records.map(({ id }) => id),
    [firstId, secondId],
  );
  assert.equal(calls.length, 2);
  assert.equal(
    new Headers(calls[0]?.init.headers).get('authorization'),
    'Bearer short-lived-import-token',
  );
  assert.equal(
    new URL(calls[1]?.url ?? '').searchParams.get('starting_after'),
    'cursor-1',
  );
  assert.deepEqual(
    calls.map(({ atMilliseconds }) => atMilliseconds),
    [0, 650],
  );
});

test('shares one 650ms pacer across REST and metadata API-key calls', async () => {
  const fileId = randomUUID();
  const recordId = randomUUID();
  const { client, calls } = createClient([
    json({
      data: { thirteenFFilings: [] },
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    json({
      data: {
        createFileUpload: {
          fileId,
          uploadUrl: `https://upload.example/${fileId}`,
          contentType: 'application/octet-stream',
          expiresAt: '2026-11-09T18:05:00.000Z',
        },
      },
    }),
    json({ data: { updateThirteenFFiling: { id: recordId } } }),
  ]);

  await client.listFilings();
  await client.createFileUpload({ filename: 'a.xlsx', sizeBytes: 1 });
  await client.attachFile({ recordId, fileId, label: 'a.xlsx' });

  assert.deepEqual(
    calls.map(({ atMilliseconds }) => atMilliseconds),
    [0, 650, 1300],
  );
  assert.ok(
    calls.every(
      ({ init }) =>
        new Headers(init.headers).get('authorization') ===
        'Bearer short-lived-import-token',
    ),
  );
});

test('honors Retry-After for 429 responses and bounds retries', async () => {
  const success = json({
    data: { thirteenFFilings: [] },
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const rateLimited = (retryAfter: string) =>
    new Response(JSON.stringify({ error: 'rate limited' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': retryAfter,
      },
    });
  const recovered = createClient([rateLimited('2'), success]);

  await recovered.client.listFilings();

  assert.deepEqual(
    recovered.calls.map(({ atMilliseconds }) => atMilliseconds),
    [0, 2000],
  );
  assert.deepEqual(recovered.sleeps, [2000]);

  const exhausted = createClient([
    rateLimited('0'),
    rateLimited('0'),
    rateLimited('0'),
    success,
  ]);
  await assert.rejects(
    exhausted.client.listFilings(),
    /CRM filing list failed/,
  );
  assert.equal(exhausted.calls.length, 3);
  assert.deepEqual(
    exhausted.calls.map(({ atMilliseconds }) => atMilliseconds),
    [0, 650, 1300],
  );
});

test('reserves FilesField uploads using only the exact universal field ID', async () => {
  const fileId = randomUUID();
  const { client, calls } = createClient([
    json({
      data: {
        createFileUpload: {
          fileId,
          uploadUrl: `https://upload.example/${fileId}`,
          contentType: 'application/octet-stream',
          expiresAt: '2026-11-09T18:05:00.000Z',
        },
      },
    }),
  ]);

  const reservation = await client.createFileUpload({
    filename: 'AAAB competitor holders.xlsx',
    sizeBytes: 123,
  });

  assert.equal(reservation.fileId, fileId);
  assert.equal(calls[0]?.url, `${APPROVED_CRM_ORIGIN}/metadata`);
  const body = JSON.parse(String(calls[0]?.init.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
  assert.match(body.query, /fieldMetadataUniversalIdentifier/);
  assert.equal(
    body.variables.fieldMetadataUniversalIdentifier,
    THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  );
  assert.equal(body.variables.fieldMetadataId, undefined);
});

test('classifies only explicit pending and missing attachment failures as replaceable', async () => {
  const fileId = randomUUID();
  for (const [message, expected] of [
    [`File ${fileId} upload has not been completed`, 'pending'],
    [`File not found: ${fileId}`, 'missing'],
  ] as const) {
    const { client } = createClient([json({ errors: [{ message }] }, 400)]);
    assert.equal(
      await client.attachFile({
        recordId: randomUUID(),
        fileId,
        label: 'a.xlsx',
      }),
      expected,
    );
  }

  const { client } = createClient([
    json({ errors: [{ message: 'database unavailable' }] }, 503),
  ]);
  await assert.rejects(
    client.attachFile({ recordId: randomUUID(), fileId, label: 'a.xlsx' }),
    /CRM attachment request failed/,
  );
});

test('uploads unmodified bytes with the server-selected content type', async () => {
  const fileId = randomUUID();
  const { client, calls } = createClient([new Response(null, { status: 204 })]);
  const bytes = Buffer.from('exact bytes');

  await client.putFile(
    {
      fileId,
      uploadUrl: `https://upload.example/${fileId}?token=secret`,
      contentType: 'application/octet-stream',
      expiresAt: '2026-11-09T18:05:00.000Z',
    },
    bytes,
  );

  assert.equal(calls[0]?.init.method, 'PUT');
  assert.equal(
    new Headers(calls[0]?.init.headers).get('content-type'),
    'application/octet-stream',
  );
  assert.deepEqual(calls[0]?.init.body, bytes);
});

test('downloads attached files only from the exact CRM FilesField path', async () => {
  const fileId = randomUUID();
  const expected = Buffer.from('verified bytes');
  const { client, calls } = createClient([
    new Response(expected, {
      status: 200,
      headers: { 'content-length': String(expected.byteLength) },
    }),
  ]);

  const bytes = await client.downloadAttachedFile({
    fileId,
    label: 'a.xlsx',
    url: `${APPROVED_CRM_ORIGIN}/file/FilesField/${fileId}?token=signed`,
  });
  assert.deepEqual(Buffer.from(bytes), expected);
  assert.equal(calls.length, 1);

  const hostile = createClient([]);
  await assert.rejects(
    hostile.client.downloadAttachedFile({
      fileId,
      label: 'a.xlsx',
      url: `https://lookalike.example/file/FilesField/${fileId}?token=signed`,
    }),
    /attached file URL is invalid/,
  );
  assert.equal(hostile.calls.length, 0);
});

test('rejects noncanonical CRM origins and never exposes destructive methods', () => {
  assert.throws(
    () =>
      new TwentyImportClient({
        origin: `${APPROVED_CRM_ORIGIN}/path`,
        token: 'token',
      }),
    /CRM origin is not approved/,
  );
  const { client } = createClient([]);
  assert.equal('deleteFiling' in client, false);
  assert.equal('deleteFile' in client, false);
});
