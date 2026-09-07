import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMigrationSchema } from '../src/schema.ts';
import { buildPsqlArguments, SOURCE_QUERIES } from '../src/source-reader.ts';
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
