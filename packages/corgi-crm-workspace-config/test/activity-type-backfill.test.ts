import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertActivityTypeBackfillCanApply,
  buildActivityTypeBackfillPlan,
  type OutreachActivityRow,
} from '../src/activity-type-backfill.ts';

const row = (
  id: string,
  activityType: string | null,
  overrides: Partial<OutreachActivityRow> = {},
): OutreachActivityRow => ({
  id,
  activityType,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('backfills canonical values without needing any human decision', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [
      row('activity-1', 'phone_call'),
      row('activity-2', 'Email'),
      row('activity-3', '  LINKEDIN  '),
    ],
  });

  assert.deepEqual(
    plan.mutations.map(({ id, data }) => [id, data.activityTypeOption]),
    [
      ['activity-1', 'PHONE_CALL'],
      ['activity-2', 'EMAIL'],
      ['activity-3', 'LINKEDIN'],
    ],
  );
  assert.equal(plan.unresolved.length, 0);
  assert.deepEqual(plan.mutations[0]!.expectedUpdatedAt, '2026-01-01T00:00:00.000Z');
});

test('reports the distinct value inventory a human rules on', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [
      row('activity-1', 'call'),
      row('activity-2', 'call'),
      row('activity-3', 'phone_call'),
      row('activity-4', 'Coffee at the airport'),
    ],
  });

  assert.deepEqual(plan.inventory, [
    { normalizedValue: 'call', count: 2, disposition: 'unresolved' },
    {
      normalizedValue: 'coffee at the airport',
      count: 1,
      disposition: 'unresolved',
    },
    { normalizedValue: 'phone_call', count: 1, disposition: 'canonical' },
  ]);
  assert.equal(plan.summary.distinctValues, 3);
});

test('refuses to apply while any value is unmapped', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [row('activity-1', 'call')],
  });

  assert.equal(plan.mutations.length, 0);
  assert.deepEqual(plan.unresolved, [
    { code: 'ACTIVITY_TYPE_UNMAPPED', rowKey: 'activity-1' },
  ]);
  assert.throws(
    () => assertActivityTypeBackfillCanApply(plan),
    /1 unresolved rows across 1 unmapped values/,
  );
});

test('applies an approved mapping instead of guessing', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [row('activity-1', 'call'), row('activity-2', 'Call')],
    approvedMapping: { call: 'phone_call' },
  });

  assert.deepEqual(
    plan.mutations.map(({ data }) => data.activityTypeOption),
    ['PHONE_CALL', 'PHONE_CALL'],
  );
  assert.deepEqual(plan.inventory, [
    { normalizedValue: 'call', count: 2, disposition: 'approved' },
  ]);
  assert.doesNotThrow(() => assertActivityTypeBackfillCanApply(plan));
});

test('never overwrites a dropdown value that is already set', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [
      row('activity-1', 'meeting', { activityTypeOption: 'EMAIL' }),
      row('activity-2', 'meeting'),
    ],
  });

  assert.deepEqual(
    plan.mutations.map(({ id }) => id),
    ['activity-2'],
  );
  assert.equal(plan.summary.alreadyBackfilledRows, 1);
});

test('counts empty values separately from unmapped ones', () => {
  const plan = buildActivityTypeBackfillPlan({
    rows: [row('activity-1', ''), row('activity-2', null), row('activity-3', '   ')],
  });

  assert.equal(plan.summary.emptyRows, 3);
  assert.equal(plan.unresolved.length, 0);
  assert.equal(plan.mutations.length, 0);
  assert.equal(plan.summary.distinctValues, 0);
});

test('rejects an approved mapping that does not target a dropdown option', () => {
  assert.throws(
    () =>
      buildActivityTypeBackfillPlan({
        rows: [row('activity-1', 'call')],
        approvedMapping: { call: 'cold_call' },
      }),
    /not a dropdown option/,
  );
});

test('rejects an approved mapping key that is not normalized', () => {
  assert.throws(
    () =>
      buildActivityTypeBackfillPlan({
        rows: [row('activity-1', 'call')],
        approvedMapping: { Call: 'phone_call' },
      }),
    /is not normalized/,
  );
});

test('rejects a duplicated row instead of planning two writes for it', () => {
  assert.throws(
    () =>
      buildActivityTypeBackfillPlan({
        rows: [row('activity-1', 'meeting'), row('activity-1', 'email')],
      }),
    /appears twice/,
  );
});
