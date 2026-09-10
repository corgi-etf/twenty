import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatInventoryReport } from '../src/activity-type-inventory.ts';

const result = (
  inventory: Array<{
    normalizedValue: string;
    count: number;
    disposition: 'canonical' | 'approved' | 'unresolved';
  }>,
  summary: Partial<{
    rows: number;
    emptyRows: number;
    alreadyBackfilledRows: number;
    mutations: number;
    distinctValues: number;
  }> = {},
) => ({
  planHash: 'b'.repeat(64),
  inventory,
  summary: {
    rows: 986,
    emptyRows: 3,
    alreadyBackfilledRows: 0,
    mutations: 900,
    distinctValues: inventory.length,
    ...summary,
  },
});

test('makes values needing a decision impossible to skim past', () => {
  const report = formatInventoryReport(
    result([
      { normalizedValue: 'phone_call', count: 900, disposition: 'canonical' },
      {
        normalizedValue: 'coffee at the airport',
        count: 31,
        disposition: 'unresolved',
      },
      { normalizedValue: 'sms', count: 12, disposition: 'unresolved' },
    ]),
  );

  assert.match(report, /NEEDS A DECISION: 2 values, 43 rows/);
  assert.match(report, /={72}/);
  assert.match(report, /coffee at the airport/);
  assert.match(report, /phone_call, email, linkedin, meeting, other/);
  assert.match(report, /Nothing is guessed/);
});

test('says so plainly when no decision is needed', () => {
  const report = formatInventoryReport(
    result([
      { normalizedValue: 'phone_call', count: 900, disposition: 'canonical' },
    ]),
  );

  assert.match(report, /Every value maps onto the dropdown/);
  assert.doesNotMatch(report, /NEEDS A DECISION/);
});

test('reports the totals a reader needs to trust the numbers', () => {
  const report = formatInventoryReport(
    result([], {
      rows: 986,
      emptyRows: 3,
      alreadyBackfilledRows: 12,
      mutations: 971,
      distinctValues: 0,
    }),
  );

  assert.match(report, /986 outreach activities read/);
  assert.match(report, /12 already have a dropdown value \(left untouched\)/);
  assert.match(report, /3 have no activity type recorded/);
  assert.match(report, /971 would be filled in by a backfill/);
});

test('prints the plan hash so an approved plan can be bound to it later', () => {
  assert.match(
    formatInventoryReport(result([])),
    new RegExp(`plan hash: ${'b'.repeat(64)}`),
  );
});

test('uses singular wording for a single unresolved row', () => {
  const report = formatInventoryReport(
    result([{ normalizedValue: 'sms', count: 1, disposition: 'unresolved' }]),
  );

  assert.match(report, /NEEDS A DECISION: 1 value, 1 row$/m);
});
