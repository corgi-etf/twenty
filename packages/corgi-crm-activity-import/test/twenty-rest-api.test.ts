import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { ActivityImportCheckpoint } from '../src/execution.ts';
import {
  createActivityImportRequestGate,
  createTwentyActivityImportApi,
  type ActivityImportRequestContext,
  type ActivityImportResponse,
} from '../src/twenty-rest-api.ts';

const response = (body: unknown, status = 200): ActivityImportResponse => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  headers: () => ({}),
  json: async () => body,
  dispose: async () => undefined,
});

class FakeRequest implements ActivityImportRequestContext {
  calls: Array<{ method: string; url: string; data?: unknown }> = [];
  responses: ActivityImportResponse[] = [];

  async get(url: string) {
    this.calls.push({ method: 'GET', url });
    return this.responses.shift()!;
  }
  async post(url: string, options: { data?: unknown }) {
    this.calls.push({ method: 'POST', url, data: options.data });
    return this.responses.shift()!;
  }
}

const immediateGate = async (request: () => Promise<ActivityImportResponse>) =>
  request();

test('paginates only the three required record collections', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({
      data: { companies: [{ id: 'company-1', name: 'Acme' }] },
      pageInfo: { hasNextPage: true, endCursor: 'company-cursor' },
    }),
    response({
      data: { companies: [{ id: 'company-2', name: 'Beta' }] },
      pageInfo: { hasNextPage: false },
    }),
    response({
      data: {
        wholesalers: [{ id: 'wholesaler-1', workspaceMemberId: 'member-1' }],
      },
      pageInfo: { hasNextPage: false },
    }),
    response({
      data: { people: [{ id: 'person-1', companyId: 'company-1' }] },
      pageInfo: { hasNextPage: false },
    }),
    response({
      data: { outreachActivities: [{ id: 'activity-1', name: 'Call' }] },
      pageInfo: { hasNextPage: false },
    }),
  );
  const api = createTwentyActivityImportApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointPath: join(tmpdir(), 'unused-activity-import-checkpoint.json'),
    requestGate: immediateGate,
  });

  assert.equal((await api.listCompanies()).length, 2);
  assert.equal((await api.listWholesalers()).length, 1);
  assert.equal((await api.listPeople()).length, 1);
  assert.equal((await api.listOutreachActivities()).length, 1);
  assert.match(request.calls[0]!.url, /\/rest\/companies\?.*depth=0/);
  assert.match(request.calls[1]!.url, /starting_after=company-cursor/);
  assert.match(request.calls[2]!.url, /\/rest\/wholesalers\?/);
  assert.match(request.calls[3]!.url, /\/rest\/people\?/);
  assert.match(request.calls[4]!.url, /\/rest\/outreachActivities\?/);
});

test('creates one outreach activity without upsert semantics', async () => {
  const request = new FakeRequest();
  request.responses.push(response({ data: { createOutreachActivity: {} } }));
  const api = createTwentyActivityImportApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointPath: join(tmpdir(), 'unused-activity-import-checkpoint.json'),
    requestGate: immediateGate,
  });
  const record = { id: 'activity-id', name: 'Call', activityType: 'call' };

  await api.createOutreachActivity(record);

  assert.equal(request.calls[0]?.method, 'POST');
  assert.equal(
    request.calls[0]?.url,
    'https://crm.corgiinvest.com/rest/outreachActivities?depth=0',
  );
  assert.deepEqual(request.calls[0]?.data, record);
  assert.doesNotMatch(request.calls[0]!.url, /upsert/);
});

test('writes and integrity-checks a PII-free checkpoint envelope', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'activity-import-api-'));
  t.after(() => rm(directory, { recursive: true }));
  const checkpointPath = join(directory, 'checkpoint.json');
  const request = new FakeRequest();
  const api = createTwentyActivityImportApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointPath,
    requestGate: immediateGate,
  });
  const checkpoint: ActivityImportCheckpoint = {
    schemaVersion: 1,
    manifest: {
      schemaVersion: 2,
      sourceFormat: 'completed-actions-v2',
      ownerLabel: 'Grace',
      sourceSha256: '1'.repeat(64),
      provenanceSha256: '2'.repeat(64),
      rowSequenceSha256: '3'.repeat(64),
      importIdHash: '4'.repeat(64),
      expectedRows: 1,
      activityDate: '2026-09-09',
      timeZone: 'America/Chicago',
      rowCount: 1,
      blankNoteCount: 0,
      distinctCompanyCount: 1,
      activityIdSetHash: '5'.repeat(64),
      planHash: '6'.repeat(64),
      normalizationReceipt: {
        schemaVersion: 1,
        sourceFormat: 'completed-actions-v2',
        sourceDocumentSha256: '2'.repeat(64),
        normalizedCsvSha256: '1'.repeat(64),
        rowSequenceSha256: '3'.repeat(64),
        sourceRowCount: 1,
        activityCount: 1,
        phoneCallCount: 1,
        voicemailCount: 0,
        emailCount: 0,
      },
    },
    status: 'planned',
    completedOperationHashes: [],
  };

  await api.writeCheckpoint(checkpoint);

  assert.deepEqual(await api.readCheckpoint(), checkpoint);
  const serialized = await readFile(checkpointPath, 'utf8');
  assert.match(serialized, /"sha256":/);
  assert.doesNotMatch(serialized, /companyName|"notes"|"phone"|"email"/);
});

test('rejects non-production origins and HTTP failures with redacted errors', async () => {
  assert.throws(
    () =>
      createTwentyActivityImportApi({
        request: new FakeRequest(),
        backendBaseUrl: 'https://example.com',
        frontendBaseUrl: 'https://example.com',
        checkpointPath: join(tmpdir(), 'unused.json'),
      }),
    /origin is not approved/,
  );
  const request = new FakeRequest();
  request.responses.push(response({ private: 'do not leak' }, 500));
  const api = createTwentyActivityImportApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointPath: join(tmpdir(), 'unused.json'),
    requestGate: immediateGate,
  });
  await assert.rejects(
    api.listCompanies(),
    /List companies failed with HTTP 500/,
  );
});

test('serializes concurrent requests at the configured minimum interval', async () => {
  let clock = 0;
  const starts: number[] = [];
  const gate = createActivityImportRequestGate({
    minimumIntervalMs: 10,
    now: () => clock,
    wait: async (delay) => {
      clock += delay;
    },
  });

  await Promise.all(
    Array.from({ length: 3 }, () =>
      gate(async () => {
        starts.push(clock);
        return response({});
      }),
    ),
  );

  assert.deepEqual(starts, [0, 10, 20]);
});

test('retries 429 responses and disposes every rejected response', async () => {
  let clock = 0;
  let disposed = 0;
  const throttled = response({}, 429);
  throttled.headers = () => ({ 'retry-after': '0.02' });
  throttled.dispose = async () => {
    disposed += 1;
  };
  const successful = response({});
  const responses = [throttled, successful];
  const gate = createActivityImportRequestGate({
    minimumIntervalMs: 10,
    now: () => clock,
    wait: async (delay) => {
      clock += delay;
    },
  });

  assert.equal(await gate(async () => responses.shift()!), successful);
  assert.equal(disposed, 1);
  assert.equal(clock, 20);
});

test('disposes every exhausted 429 response before failing', async () => {
  let disposed = 0;
  const gate = createActivityImportRequestGate({
    minimumIntervalMs: 0,
    wait: async () => undefined,
  });

  await assert.rejects(
    gate(async () => ({
      ...response({}, 429),
      dispose: async () => {
        disposed += 1;
      },
    })),
    /remained rate limited/,
  );
  assert.equal(disposed, 5);
});
