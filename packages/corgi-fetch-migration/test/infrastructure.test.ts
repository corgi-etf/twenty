import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMigrationSchema } from '../src/schema.ts';
import {
  buildPsqlArguments,
  buildPsqlEnvironment,
  SOURCE_QUERIES,
} from '../src/source-reader.ts';
import { TwentyApiError, TwentyClient } from '../src/twenty-client.ts';

test('schema declares every migration object and unique provenance fields', () => {
  const schema = buildMigrationSchema([
    { id: '1', name: 'Buffer Buyer' },
    { id: '2', name: 'Independent RIA' },
  ]);

  assert.deepEqual(
    schema.objects.map(({ namePlural }) => namePlural),
    [
      'wholesalers',
      'salesTeams',
      'teamMemberships',
      'leadAssignments',
      'outreachActivities',
      'sourceRecords',
      'holdingObservations',
      'importBatches',
      'importReviewItems',
      'archivedOutreachActivities',
    ],
  );
  for (const objectName of [
    'company',
    'person',
    'task',
    ...schema.objects.map(({ nameSingular }) => nameSingular),
  ]) {
    assert.equal(
      schema.fields.some(
        (field) =>
          field.objectName === objectName &&
          field.name === 'legacyFetchId' &&
          field.isUnique,
      ),
      true,
      `${objectName} lacks a unique legacyFetchId`,
    );
  }
  const tags = schema.fields.find(
    ({ objectName, name }) => objectName === 'company' && name === 'fetchTags',
  );
  assert.deepEqual(
    tags?.options?.map(({ value }) => value),
    ['BUFFER_BUYER', 'INDEPENDENT_RIA'],
  );
  assert.equal(
    schema.fields.some(
      ({ objectName, name, relation }) =>
        objectName === 'leadAssignment' &&
        name === 'company' &&
        relation?.targetObjectName === 'company',
    ),
    true,
  );
  assert.equal(
    schema.fields.some(
      ({ objectName, name, relation }) =>
        objectName === 'company' &&
        name === 'historicalOwner' &&
        relation?.targetObjectName === 'wholesaler',
    ),
    true,
  );
  assert.equal(
    schema.fields.some(
      ({ objectName, name, type }) =>
        objectName === 'person' &&
        name === 'legacyPrimaryPhone' &&
        type === 'TEXT',
    ),
    true,
  );
  assert.equal(
    schema.fields.some(
      ({ objectName, name, type }) =>
        objectName === 'person' &&
        name === 'legacyLinkedInUrl' &&
        type === 'TEXT',
    ),
    true,
  );
});

test('schema rejects tags that collapse to the same Twenty option value', () => {
  assert.throws(
    () =>
      buildMigrationSchema([
        { id: '1', name: 'RIA+' },
        { id: '2', name: 'RIA ' },
      ]),
    /tag.*collision/i,
  );
});

test('source reader wraps every query in a read-only transaction without embedding credentials', () => {
  assert.ok(SOURCE_QUERIES.length >= 10);
  for (const query of SOURCE_QUERIES) {
    const args = buildPsqlArguments(query.sql);
    const command = args.join(' ');

    assert.match(command, /BEGIN TRANSACTION READ ONLY/);
    assert.match(command, /COPY \(/);
    assert.doesNotMatch(command, /postgresql:\/\//);
    assert.doesNotMatch(command, /password/i);
  }
});

test('source row JSON alias cannot collide with a source_row column', () => {
  const command = buildPsqlArguments(
    'SELECT id, source_row FROM public.import_review_items',
  ).join(' ');

  assert.match(command, /row_to_json\(corgi_source_record\)/);
  assert.match(command, /AS corgi_source_record/);
  assert.doesNotMatch(command, /row_to_json\(source_row\)/);
});

test('source reader converts a connection URL to allowlisted libpq environment variables', () => {
  const environment = buildPsqlEnvironment(
    'postgresql://db_user:p%40ss@db.example:6543/crm%20data?sslmode=require&channel_binding=require&ignored=secret',
    { PATH: '/bin', PGSERVICE: 'unsafe-default' },
  );

  assert.deepEqual(environment, {
    PATH: '/bin',
    PGHOST: 'db.example',
    PGPORT: '6543',
    PGUSER: 'db_user',
    PGPASSWORD: 'p@ss',
    PGDATABASE: 'crm data',
    PGSSLMODE: 'require',
    PGCHANNELBINDING: 'require',
    PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'corgi-fetch-migration-read-only',
  });
  assert.equal(Object.values(environment).includes('ignored=secret'), false);
  assert.throws(
    () => buildPsqlEnvironment('https://db.example/database'),
    /PostgreSQL connection URL/i,
  );
});

test('Twenty client retries only timeout, 429, and 5xx responses', async () => {
  let attempts = 0;
  const retryingFetch: typeof fetch = async () => {
    attempts += 1;
    return attempts === 1
      ? new Response('{"error":"busy"}', { status: 503 })
      : new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
  };
  const client = new TwentyClient(
    'https://crm.example',
    'secret',
    retryingFetch,
    2,
  );

  assert.deepEqual(await client.request('/rest/companies'), { ok: true });
  assert.equal(attempts, 2);

  attempts = 0;
  const badRequestFetch: typeof fetch = async () => {
    attempts += 1;
    return new Response('{"error":"invalid"}', { status: 400 });
  };
  const noRetryClient = new TwentyClient(
    'https://crm.example',
    'secret',
    badRequestFetch,
    4,
  );

  await assert.rejects(
    () => noRetryClient.request('/rest/companies'),
    (error: unknown) => error instanceof TwentyApiError && error.status === 400,
  );
  assert.equal(attempts, 1);
});

test('Twenty client honors Retry-After across repeated 429 responses', async () => {
  let attempts = 0;
  let now = Date.parse('2026-09-08T00:00:00Z');
  const delays: number[] = [];
  const rateLimitedFetch: typeof fetch = async () => {
    attempts += 1;

    if (attempts === 1) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '60' },
      });
    }
    if (attempts === 2) {
      return new Response('still limited', {
        status: 429,
        headers: {
          'retry-after': new Date(now + 2_000).toUTCString(),
        },
      });
    }

    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new TwentyClient(
    'https://crm.example',
    'secret',
    rateLimitedFetch,
    1,
    {
      now: () => now,
      sleep: async (delay) => {
        delays.push(delay);
        now += delay;
      },
      maxRateLimitWaitMs: 180_000,
    },
  );

  assert.deepEqual(await client.request('/rest/tasks'), { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [60_000, 2_000]);
});

test('Twenty client bounds 429 waits and uses the server window fallback', async () => {
  let attempts = 0;
  let now = 0;
  const delays: number[] = [];
  const alwaysLimitedFetch: typeof fetch = async () => {
    attempts += 1;
    return new Response('rate limited', { status: 429 });
  };
  const client = new TwentyClient(
    'https://crm.example',
    'secret',
    alwaysLimitedFetch,
    1,
    {
      now: () => now,
      sleep: async (delay) => {
        delays.push(delay);
        now += delay;
      },
      maxRateLimitWaitMs: 90_000,
    },
  );

  await assert.rejects(
    () => client.request('/rest/tasks'),
    (error: unknown) => error instanceof TwentyApiError && error.status === 429,
  );
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [60_000]);
});

test('Twenty relation metadata payload includes the required target field icon', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const captureFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new TwentyClient(
    'https://crm.example',
    'secret',
    captureFetch,
    1,
  );
  const relation = buildMigrationSchema([]).fields.find(
    ({ objectName, name }) =>
      objectName === 'company' && name === 'historicalOwner',
  )!;

  await client.createMetadataField(
    relation,
    'company-object-id',
    'owner-object-id',
  );

  assert.deepEqual(requestBody?.relationCreationPayload, {
    targetObjectMetadataId: 'owner-object-id',
    targetFieldLabel: 'Companies',
    targetFieldIcon: 'IconLink',
    type: 'MANY_TO_ONE',
  });
});

test('Twenty metadata listing projects relation targets from core OpenAPI', async () => {
  const requestedPaths: string[] = [];
  const metadataFetch: typeof fetch = async (input) => {
    const url = new URL(input.toString());
    requestedPaths.push(url.pathname);

    if (url.pathname === '/rest/metadata/objects') {
      return Response.json({
        data: [
          {
            id: 'company-id',
            nameSingular: 'company',
            namePlural: 'companies',
            fields: [
              {
                id: 'owner-field-id',
                name: 'historicalOwner',
                type: 'RELATION',
                isUnique: false,
                settings: { relationType: 'MANY_TO_ONE' },
              },
            ],
          },
          {
            id: 'wholesaler-id',
            nameSingular: 'wholesaler',
            namePlural: 'wholesalers',
            fields: [],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    }

    if (url.pathname === '/rest/open-api/core') {
      return Response.json({
        components: {
          schemas: {
            CompanyForResponse: {
              properties: {
                historicalOwner: {
                  type: 'object',
                  oneOf: [
                    {
                      $ref: '#/components/schemas/WholesalerForResponse',
                    },
                  ],
                },
              },
            },
          },
        },
      });
    }

    return new Response('not found', { status: 404 });
  };
  const client = new TwentyClient(
    'https://crm.example',
    'secret',
    metadataFetch,
    1,
  );

  const objects = await client.listMetadataObjects();

  assert.deepEqual(requestedPaths, [
    '/rest/metadata/objects',
    '/rest/open-api/core',
  ]);
  assert.equal(
    objects[0]?.fields?.[0]?.relationTargetObjectMetadataId,
    'wholesaler-id',
  );
});
