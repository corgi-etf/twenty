import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { ActivityImportCheckpoint } from '../src/execution.ts';
import {
  createTwentyActivityImportApi,
  type ActivityImportRequestContext,
  type ActivityImportResponse,
} from '../src/twenty-rest-api.ts';

const response = (
  body: unknown,
  status = 200,
): ActivityImportResponse => ({
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

const immediateGate = async (
  request: () => Promise<ActivityImportResponse>,
) => request();

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
  assert.equal((await api.listOutreachActivities()).length, 1);
  assert.match(request.calls[0]!.url, /\/rest\/companies\?.*depth=0/);
  assert.match(request.calls[1]!.url, /starting_after=company-cursor/);
  assert.match(request.calls[2]!.url, /\/rest\/wholesalers\?/);
  assert.match(request.calls[3]!.url, /\/rest\/outreachActivities\?/);
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
      schemaVersion: 1,
      sourceSha256: '1'.repeat(64),
      importIdHash: '2'.repeat(64),
      expectedRows: 1,
      activityDate: '2026-09-09',
      timeZone: 'America/Chicago',
      rowCount: 1,
      blankNoteCount: 0,
      distinctCompanyCount: 1,
      activityIdSetHash: '3'.repeat(64),
      planHash: '4'.repeat(64),
    },
    status: 'planned',
    completedOperationHashes: [],
  };

  await api.writeCheckpoint(checkpoint);

  assert.deepEqual(await api.readCheckpoint(), checkpoint);
  const serialized = await readFile(checkpointPath, 'utf8');
  assert.match(serialized, /"sha256":/);
  assert.doesNotMatch(serialized, /companyName|notes|phone|email/);
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
  await assert.rejects(api.listCompanies(), /List companies failed with HTTP 500/);
});
