import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { CanonicalizationCheckpoint } from '../src/execution.ts';
import type { RateLimitedResponse } from '../src/request-gate.ts';
import {
  CANONICALIZATION_MAX_BODY_BYTES,
  createTwentyRestCanonicalizationApi,
  type CanonicalizationRequestContext,
  type CanonicalizationResponse,
} from '../src/twenty-rest-api.ts';

type Call = {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  options: { headers: Record<string, string>; data?: unknown };
};

class FakeResponse implements CanonicalizationResponse {
  disposed = false;
  readonly statusCode: number;
  readonly body: unknown;
  readonly responseHeaders: Record<string, string>;

  constructor(
    statusCode: number,
    body: unknown = {},
    responseHeaders: Record<string, string> = {},
  ) {
    this.statusCode = statusCode;
    this.body = body;
    this.responseHeaders = responseHeaders;
  }

  status() {
    return this.statusCode;
  }

  ok() {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  headers() {
    return this.responseHeaders;
  }

  async json() {
    return this.body;
  }

  async dispose() {
    this.disposed = true;
  }
}

class FakeRequest implements CanonicalizationRequestContext {
  calls: Call[] = [];
  responses: FakeResponse[] = [];

  private async call(
    method: Call['method'],
    url: string,
    options: Call['options'],
  ): Promise<FakeResponse> {
    this.calls.push({ method, url, options });
    const response = this.responses.shift();
    assert.ok(response, 'missing fake response');

    return response;
  }

  get(url: string, options: Call['options']) {
    return this.call('GET', url, options);
  }

  post(url: string, options: Call['options']) {
    return this.call('POST', url, options);
  }

  patch(url: string, options: Call['options']) {
    return this.call('PATCH', url, options);
  }
}

const immediateGate = async <T extends RateLimitedResponse>(
  request: () => Promise<T>,
): Promise<T> => request();

const manifest = {
  sourceRecordRows: 0,
  reviewItemRows: 0,
  holdingRawRows: 0,
  companyRecords: 0,
  personRecords: 0,
  holdingRecords: 0,
  stagingRows: 0,
  distinctBusinessRows: 0,
  duplicateRows: 0,
  nonemptyRawValues: 0,
  disposedRawValues: 0,
  dispositionsByKind: {},
  rowCoverageHash: 'a'.repeat(64),
  businessContentHash: 'b'.repeat(64),
  dispositionHash: 'c'.repeat(64),
  companyIdSetHash:
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  personIdSetHash:
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  holdingIdSetHash:
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
};

const createApi = (request: FakeRequest, checkpointFilePath = '/unused') =>
  createTwentyRestCanonicalizationApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath,
    requestGate: immediateGate,
  });

test('REST pagination uses authenticated Origin shapes and disposes responses', async () => {
  const request = new FakeRequest();
  const first = new FakeResponse(200, {
    data: { people: [{ id: 'person-1' }] },
    pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
  });
  const second = new FakeResponse(200, {
    data: { people: [{ id: 'person-2' }] },
    pageInfo: { hasNextPage: false },
  });
  request.responses.push(first, second);

  const records = await createApi(request).listAll('people');

  assert.deepEqual(
    records.map(({ id }) => id),
    ['person-1', 'person-2'],
  );
  assert.equal(
    request.calls[0]?.url,
    'https://crm.corgiinvest.com/rest/people?limit=100&depth=0',
  );
  assert.match(request.calls[1]?.url ?? '', /starting_after=cursor-1/);
  assert.deepEqual(request.calls[0]?.options.headers, {
    Origin: 'https://crm.corgiinvest.com',
  });
  assert.equal(first.disposed, true);
  assert.equal(second.disposed, true);
});

test('metadata relation targets are projected from the core OpenAPI response', async () => {
  const request = new FakeRequest();
  const metadataResponse = new FakeResponse(200, {
    data: [
      {
        id: 'task-object',
        nameSingular: 'task',
        fields: [
          {
            id: 'task-wholesaler',
            name: 'wholesaler',
            label: 'Wholesaler',
            type: 'RELATION',
            settings: { relationType: 'MANY_TO_ONE' },
          },
        ],
      },
      {
        id: 'wholesaler-object',
        nameSingular: 'wholesaler',
        fields: [
          {
            id: 'wholesaler-tasks',
            name: 'tasks',
            label: 'Tasks',
            type: 'RELATION',
            settings: { relationType: 'ONE_TO_MANY' },
          },
        ],
      },
    ],
    pageInfo: { hasNextPage: false },
  });
  const openApiResponse = new FakeResponse(200, {
    components: {
      schemas: {
        TaskForResponse: {
          properties: {
            wholesaler: {
              $ref: '#/components/schemas/WholesalerForResponse',
            },
          },
        },
        WholesalerForResponse: {
          properties: {
            tasks: {
              items: { $ref: '#/components/schemas/TaskForResponse' },
            },
          },
        },
      },
    },
  });
  request.responses.push(metadataResponse, openApiResponse);

  const objects = await createApi(request).listMetadataObjects();

  assert.equal(
    objects[0]?.fields[0]?.relationTargetObjectMetadataId,
    'wholesaler-object',
  );
  assert.equal(
    objects[1]?.fields[0]?.relationTargetObjectMetadataId,
    'task-object',
  );
  assert.equal(
    request.calls[1]?.url,
    'https://crm.corgiinvest.com/rest/open-api/core',
  );
  assert.equal(metadataResponse.disposed, true);
  assert.equal(openApiResponse.disposed, true);
});

test('relation metadata uses the exact Twenty relationCreationPayload', async () => {
  const request = new FakeRequest();
  request.responses.push(new FakeResponse(201));

  await createApi(request).createMetadataField({
    objectName: 'task',
    objectMetadataId: 'task-object',
    name: 'wholesaler',
    label: 'Wholesaler',
    type: 'RELATION',
    relationTargetObjectMetadataId: 'wholesaler-object',
    targetFieldLabel: 'Tasks',
    targetFieldIcon: 'IconChecklist',
    relationType: 'MANY_TO_ONE',
  });

  assert.deepEqual(request.calls[0], {
    method: 'POST',
    url: 'https://crm.corgiinvest.com/rest/metadata/fields',
    options: {
      headers: { Origin: 'https://crm.corgiinvest.com' },
      data: {
        objectMetadataId: 'task-object',
        type: 'RELATION',
        name: 'wholesaler',
        label: 'Wholesaler',
        isLabelSyncedWithName: false,
        relationCreationPayload: {
          targetObjectMetadataId: 'wholesaler-object',
          targetFieldLabel: 'Tasks',
          targetFieldIcon: 'IconChecklist',
          type: 'MANY_TO_ONE',
        },
      },
    },
  });
});

test('record batches use upsert and reject count or byte overflow before request', async () => {
  const request = new FakeRequest();
  request.responses.push(new FakeResponse(200));
  const api = createApi(request);
  const records = [
    { id: 'target-1', taskId: 'task-1', targetPersonId: 'person-1' },
  ];

  await api.upsertBatch('taskTargets', records);
  assert.deepEqual(request.calls[0], {
    method: 'POST',
    url: 'https://crm.corgiinvest.com/rest/batch/taskTargets?upsert=true&depth=0',
    options: {
      headers: { Origin: 'https://crm.corgiinvest.com' },
      data: records,
    },
  });
  await assert.rejects(api.upsertBatch('taskTargets', []), /1 through 100/);
  await assert.rejects(
    api.upsertBatch('people', [
      { id: 'person-big', bio: 'x'.repeat(CANONICALIZATION_MAX_BODY_BYTES) },
    ]),
    /body is too large/,
  );
  assert.equal(request.calls.length, 1);
});

test('existing records use an atomic id and updatedAt conditional patch', async () => {
  const request = new FakeRequest();
  request.responses.push(
    new FakeResponse(200, {
      data: { updatePeople: [{ id: 'person-1' }] },
    }),
  );
  const api = createApi(request);

  await api.conditionalPatchOne(
    'people',
    'person-1',
    '2026-01-01T00:00:00.000Z',
    { bio: 'Imported biography' },
  );

  const call = request.calls[0];
  assert.equal(call?.method, 'PATCH');
  assert.deepEqual(call?.options, {
    headers: { Origin: 'https://crm.corgiinvest.com' },
    data: { bio: 'Imported biography' },
  });
  const url = new URL(call?.url ?? '');
  assert.equal(
    url.origin + url.pathname,
    'https://crm.corgiinvest.com/rest/people',
  );
  assert.equal(url.searchParams.get('depth'), '0');
  assert.equal(
    url.searchParams.get('filter'),
    'and(id[eq]:"person-1",updatedAt[eq]:"2026-01-01T00:00:00.000Z")',
  );
});

test('conditional patches fail closed on zero, multiple, or wrong records', async () => {
  for (const records of [
    [],
    [{ id: 'person-1' }, { id: 'person-2' }],
    [{ id: 'person-2' }],
  ]) {
    const request = new FakeRequest();
    request.responses.push(
      new FakeResponse(200, { data: { updatePeople: records } }),
    );

    await assert.rejects(
      createApi(request).conditionalPatchOne(
        'people',
        'person-1',
        '2026-01-01T00:00:00.000Z',
        { bio: 'Imported biography' },
      ),
      (error: Error) =>
        error.message === 'Canonicalization concurrency conflict for people' &&
        !error.message.includes('person-1'),
    );
    assert.equal(request.calls.length, 1);
  }
});

test('hostile and noncanonical endpoints fail before any request', () => {
  for (const [frontendBaseUrl, backendBaseUrl] of [
    ['https://lookalike.example', 'https://crm.corgiinvest.com'],
    ['https://crm.corgiinvest.com', 'https://lookalike.example'],
    ['https://crm.corgiinvest.com/path', 'https://crm.corgiinvest.com'],
    ['https://crm.corgiinvest.com', 'https://crm.corgiinvest.com?query=1'],
    ['https://crm.corgiinvest.com/', 'https://crm.corgiinvest.com'],
  ]) {
    const request = new FakeRequest();
    assert.throws(
      () =>
        createTwentyRestCanonicalizationApi({
          request,
          backendBaseUrl,
          frontendBaseUrl,
          checkpointFilePath: '/unused',
          requestGate: immediateGate,
        }),
      /origin is not approved/,
    );
    assert.equal(request.calls.length, 0);
  }
});

test('HTTP errors are status-only and never echo a response body', async () => {
  const request = new FakeRequest();
  const rejected = new FakeResponse(422, {
    error: 'rejected person@example.test +1-555-555-1234',
  });
  request.responses.push(rejected);

  await assert.rejects(
    createApi(request).upsertBatch('people', [{ id: 'person-1' }]),
    (error: Error) =>
      error.message === 'Upsert people failed with HTTP 422' &&
      !error.message.includes('person@example.test'),
  );
  assert.equal(rejected.disposed, true);
});

test('checkpoint writes are atomic, shape checked, and integrity protected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-canonicalization-'));
  const path = join(directory, 'checkpoint.json');
  const checkpoint: CanonicalizationCheckpoint = {
    schemaVersion: 2,
    origin: 'https://crm.corgiinvest.com',
    manifest,
    expectedFinalManifest: manifest,
    recordIdentityCommitments: {
      companies: { initialIdHashes: [], allowedCreateIdHashes: [] },
      people: { initialIdHashes: [], allowedCreateIdHashes: [] },
      holdingObservations: {
        initialIdHashes: [],
        allowedCreateIdHashes: [],
      },
    },
    status: 'records',
    completedOperations: [{ key: 'batch:people:abc', sha256: 'd'.repeat(64) }],
  };
  try {
    const api = createApi(new FakeRequest(), path);
    await api.writeCheckpoint(checkpoint);
    assert.deepEqual(await api.readCheckpoint(), checkpoint);

    const envelope = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      unknown
    >;
    envelope.sha256 = '0'.repeat(64);
    await writeFile(path, JSON.stringify(envelope), 'utf8');
    await assert.rejects(api.readCheckpoint(), /integrity check/);
    await assert.rejects(
      api.writeCheckpoint({
        ...checkpoint,
        completedOperations: [
          { key: 'duplicate', sha256: 'd'.repeat(64) },
          { key: 'duplicate', sha256: 'd'.repeat(64) },
        ],
      }),
      /invalid shape/,
    );
    await assert.rejects(
      api.writeCheckpoint({
        ...checkpoint,
        recordIdentityCommitments: {
          ...checkpoint.recordIdentityCommitments,
          companies: {
            initialIdHashes: [],
            allowedCreateIdHashes: ['e'.repeat(64)],
          },
        },
      }),
      /do not match the manifests/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
