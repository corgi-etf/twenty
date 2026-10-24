import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activityTypeBackfillPlanHash,
  APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
  runActivityTypeBackfill,
  type ActivityTypeBackfillApi,
  type ActivityTypeBackfillCheckpoint,
} from '../src/activity-type-backfill-execution.ts';
import {
  buildActivityTypeBackfillPlan,
  type OutreachActivityRow,
} from '../src/activity-type-backfill.ts';

const rows: OutreachActivityRow[] = [
  {
    id: 'activity-1',
    activityType: 'call',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'activity-2',
    activityType: 'meeting',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

class FakeApi implements ActivityTypeBackfillApi {
  public events: string[] = [];
  public checkpoint: ActivityTypeBackfillCheckpoint | undefined;
  public priorCheckpoint: unknown;

  public source: OutreachActivityRow[] = rows;

  async listOutreachActivities() {
    this.events.push('list');

    return this.source.map((row) => ({ ...row }));
  }

  async conditionalPatchOutreachActivity(
    id: string,
    expectedUpdatedAt: string,
    data: { activityTypeOption: string },
  ) {
    this.events.push(`patch:${id}:${expectedUpdatedAt}:${data.activityTypeOption}`);
  }

  async readCheckpoint() {
    this.events.push('read-checkpoint');

    return this.priorCheckpoint;
  }

  async writeCheckpoint(value: ActivityTypeBackfillCheckpoint) {
    this.events.push(`write-checkpoint:${value.appliedIds.length}`);
    this.checkpoint = value;
  }
}

const options = {
  origin: 'https://crm.corgiinvest.com',
  expectedOrigin: 'https://crm.corgiinvest.com',
};

const approvedMapping = { call: 'phone_call' };

const planHashFor = (mapping?: Record<string, string>) =>
  activityTypeBackfillPlanHash(
    buildActivityTypeBackfillPlan({ rows, approvedMapping: mapping }),
  );

test('defaults to a dry run that reads production and writes nothing', async () => {
  const api = new FakeApi();

  const result = await runActivityTypeBackfill(api, options);

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.appliedMutations, 0);
  assert.deepEqual(api.events, ['list']);
  assert.equal(api.checkpoint, undefined);
});

test('returns the distinct value inventory from one dry-run pass', async () => {
  const api = new FakeApi();

  const result = await runActivityTypeBackfill(api, options);

  assert.deepEqual(result.inventory, [
    { normalizedValue: 'call', count: 1, disposition: 'unresolved' },
    { normalizedValue: 'meeting', count: 1, disposition: 'canonical' },
  ]);
  assert.equal(result.summary.distinctValues, 2);
  assert.equal(result.unresolved.length, 1);
});

test('a dry run never blocks on unresolved values', async () => {
  const api = new FakeApi();

  await assert.doesNotReject(() => runActivityTypeBackfill(api, options));
});

test('refuses to execute without the exact confirmation', async () => {
  const api = new FakeApi();

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        ...options,
        execute: true,
        confirmation: 'PLEASE',
        expectedPlanHash: planHashFor(approvedMapping),
      }),
    /exact confirmation/,
  );
  assert.deepEqual(api.events, []);
});

test('refuses to execute without the trusted dry-run plan hash', async () => {
  const api = new FakeApi();

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        ...options,
        execute: true,
        confirmation: APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
      }),
    /trusted dry-run plan hash/,
  );
  assert.deepEqual(api.events, []);
});

test('aborts an execute run when a prior checkpoint exists', async () => {
  const api = new FakeApi();
  api.priorCheckpoint = { schemaVersion: 1, appliedIds: ['activity-1'] };

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        ...options,
        execute: true,
        confirmation: APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
        expectedPlanHash: planHashFor(approvedMapping),
        approvedMapping,
      }),
    /prior checkpoint/,
  );
  assert.ok(!api.events.includes('list'));
});

test('refuses to execute a plan that changed since the approved dry run', async () => {
  const api = new FakeApi();

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        ...options,
        execute: true,
        confirmation: APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
        expectedPlanHash: planHashFor(),
        approvedMapping,
      }),
    /plan changed since the approved dry run/,
  );
});

test('refuses to execute while any value is still unresolved', async () => {
  const api = new FakeApi();

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        ...options,
        execute: true,
        confirmation: APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
        expectedPlanHash: planHashFor(),
      }),
    /unresolved rows/,
  );
});

test('writes each row compare-and-set and checkpoints after every write', async () => {
  const api = new FakeApi();

  const result = await runActivityTypeBackfill(api, {
    ...options,
    execute: true,
    confirmation: APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
    expectedPlanHash: planHashFor(approvedMapping),
    approvedMapping,
  });

  assert.equal(result.mode, 'execute');
  assert.equal(result.appliedMutations, 2);
  assert.deepEqual(api.events, [
    'read-checkpoint',
    'list',
    'patch:activity-1:2026-01-01T00:00:00.000Z:PHONE_CALL',
    'write-checkpoint:1',
    'patch:activity-2:2026-01-02T00:00:00.000Z:MEETING',
    'write-checkpoint:2',
  ]);
  assert.deepEqual(api.checkpoint?.appliedIds, ['activity-1', 'activity-2']);
});

test('rejects an unapproved origin before touching production', async () => {
  const api = new FakeApi();

  await assert.rejects(
    () =>
      runActivityTypeBackfill(api, {
        origin: 'https://staging.corgiinvest.com',
        expectedOrigin: 'https://staging.corgiinvest.com',
      }),
    /origin is not approved/,
  );
  assert.deepEqual(api.events, []);
});
