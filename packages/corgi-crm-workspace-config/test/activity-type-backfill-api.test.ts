import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createActivityTypeBackfillReadApi,
  createActivityTypeBackfillWriteApi,
  grantActivityTypeBackfillWrite,
  type BackfillRequest,
  type BackfillResponse,
} from '../src/activity-type-backfill-api.ts';
import { APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION } from '../src/activity-type-backfill-execution.ts';

const response = (body: unknown, ok = true, status = 200): BackfillResponse => ({
  ok: () => ok,
  status: () => status,
  json: async () => body,
  dispose: async () => undefined,
});

const fakeRequest = (
  pages: unknown[],
  patchBody: unknown = { data: { updateOutreachActivities: [{ id: 'a1' }] } },
): BackfillRequest & { urls: string[]; patched: unknown[] } => {
  const urls: string[] = [];
  const patched: unknown[] = [];
  let page = 0;

  return {
    urls,
    patched,
    async get(url) {
      urls.push(url);

      return response(pages[page++]);
    },
    async patch(url, options) {
      urls.push(url);
      patched.push(options.data);

      return response(patchBody);
    },
  };
};

const checkpointPath = async () =>
  join(await mkdtemp(join(tmpdir(), 'activity-backfill-')), 'checkpoint.json');

const baseOptions = async (request: BackfillRequest) => ({
  origin: 'https://crm.corgiinvest.com',
  apiKey: 'test-key',
  request,
  checkpointFilePath: await checkpointPath(),
});

test('the read api exposes no way to write', async () => {
  const request = fakeRequest([{ data: { outreachActivities: [] } }]);
  const api = createActivityTypeBackfillReadApi(await baseOptions(request));

  assert.equal(
    (api as Record<string, unknown>).conditionalPatchOutreachActivity,
    undefined,
  );
  assert.deepEqual(Object.keys(api).sort(), [
    'listOutreachActivities',
    'readCheckpoint',
    'writeCheckpoint',
  ]);
});

test('pages through every outreach activity', async () => {
  const request = fakeRequest([
    {
      data: {
        outreachActivities: [
          { id: 'a1', activityType: 'call', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      },
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    },
    {
      data: {
        outreachActivities: [
          { id: 'a2', activityType: 'email', updatedAt: '2026-01-02T00:00:00.000Z' },
        ],
      },
      pageInfo: { hasNextPage: false },
    },
  ]);
  const api = createActivityTypeBackfillReadApi(await baseOptions(request));

  const rows = await api.listOutreachActivities();

  assert.deepEqual(
    rows.map(({ id }) => id),
    ['a1', 'a2'],
  );
  assert.ok(request.urls[1]?.includes('starting_after=cursor-1'));
});

test('fails rather than returning a short read when the cursor is missing', async () => {
  const request = fakeRequest([
    {
      data: { outreachActivities: [] },
      pageInfo: { hasNextPage: true, endCursor: null },
    },
  ]);
  const api = createActivityTypeBackfillReadApi(await baseOptions(request));

  await assert.rejects(
    () => api.listOutreachActivities(),
    /pagination omitted its cursor/,
  );
});

test('rejects a row that cannot support compare-and-set', async () => {
  const request = fakeRequest([
    { data: { outreachActivities: [{ id: 'a1', activityType: 'call' }] } },
  ]);
  const api = createActivityTypeBackfillReadApi(await baseOptions(request));

  await assert.rejects(
    () => api.listOutreachActivities(),
    /missing its id or updatedAt/,
  );
});

test('round-trips a checkpoint and detects tampering', async () => {
  const request = fakeRequest([]);
  const options = await baseOptions(request);
  const api = createActivityTypeBackfillReadApi(options);

  assert.equal(await api.readCheckpoint(), undefined);

  await api.writeCheckpoint({
    schemaVersion: 1,
    origin: 'https://crm.corgiinvest.com',
    planHash: 'a'.repeat(64),
    appliedIds: ['a1'],
  });
  assert.deepEqual(await api.readCheckpoint(), {
    schemaVersion: 1,
    origin: 'https://crm.corgiinvest.com',
    planHash: 'a'.repeat(64),
    appliedIds: ['a1'],
  });

  const raw = JSON.parse(await readFile(options.checkpointFilePath, 'utf8'));
  raw.checkpoint.appliedIds = ['a1', 'a2'];
  await writeFile(options.checkpointFilePath, JSON.stringify(raw), 'utf8');

  await assert.rejects(() => api.readCheckpoint(), /integrity check/);
});

test('rejects an unapproved origin and a missing key before any call', async () => {
  const request = fakeRequest([]);
  const options = await baseOptions(request);

  await assert.rejects(
    async () =>
      createActivityTypeBackfillReadApi({
        ...options,
        origin: 'https://staging.corgiinvest.com',
      }),
    /origin is not approved/,
  );
  await assert.rejects(
    async () => createActivityTypeBackfillReadApi({ ...options, apiKey: '  ' }),
    /TWENTY_API_KEY/,
  );
  assert.deepEqual(request.urls, []);
});

test('the write api cannot be built without the exact confirmation', async () => {
  const request = fakeRequest([]);
  const options = await baseOptions(request);

  assert.throws(
    () => grantActivityTypeBackfillWrite('BACKFILL'),
    /write grant is invalid/,
  );
  assert.throws(
    () =>
      createActivityTypeBackfillWriteApi(
        options,
        undefined as unknown as ReturnType<
          typeof grantActivityTypeBackfillWrite
        >,
      ),
    /write grant is required/,
  );
});

test('writes compare-and-set on updatedAt', async () => {
  const request = fakeRequest(
    [],
    { data: { updateOutreachActivities: [{ id: 'a1' }] } },
  );
  const api = createActivityTypeBackfillWriteApi(
    await baseOptions(request),
    grantActivityTypeBackfillWrite(APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION),
  );

  await api.conditionalPatchOutreachActivity('a1', '2026-01-01T00:00:00.000Z', {
    activityTypeOption: 'PHONE_CALL',
  });

  assert.ok(request.urls[0]?.includes('updatedAt%5Beq%5D'));
  assert.deepEqual(request.patched, [{ activityTypeOption: 'PHONE_CALL' }]);
});

test('treats a row that changed underneath as a conflict', async () => {
  const request = fakeRequest([], { data: { updateOutreachActivities: [] } });
  const api = createActivityTypeBackfillWriteApi(
    await baseOptions(request),
    grantActivityTypeBackfillWrite(APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION),
  );

  await assert.rejects(
    () =>
      api.conditionalPatchOutreachActivity('a1', '2026-01-01T00:00:00.000Z', {
        activityTypeOption: 'PHONE_CALL',
      }),
    /concurrency conflict/,
  );
});
