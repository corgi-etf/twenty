import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeOutreachRowShape } from '../src/outreach-row-shape.ts';
import { type OutreachActivityRow } from '../src/activity-type-backfill.ts';

const row = (overrides: Partial<OutreachActivityRow> = {}): OutreachActivityRow => ({
  id: 'activity-1',
  updatedAt: '2026-01-01T00:00:00.000Z',
  occurredAt: '2026-01-01T00:00:00.000Z',
  wholesalerId: 'wholesaler-1',
  createdBy: { source: 'MANUAL' },
  ...overrides,
});

test('counts rows missing the fields that decide backfill versus load', () => {
  const shape = summarizeOutreachRowShape([
    row(),
    row({ id: 'a2', occurredAt: null }),
    row({ id: 'a3', occurredAt: '' }),
    row({ id: 'a4', wholesalerId: null }),
    row({ id: 'a5', occurredAt: undefined, wholesalerId: undefined }),
  ]);

  assert.equal(shape.total, 5);
  assert.equal(shape.missingOccurredAt, 3);
  assert.equal(shape.missingWholesaler, 2);
});

test('buckets by createdBy source and never reads the rest of that composite', () => {
  const shape = summarizeOutreachRowShape([
    row({ createdBy: { source: 'IMPORT' } }),
    row({ id: 'a2', createdBy: { source: 'import' } }),
    row({ id: 'a3', createdBy: { source: 'MANUAL' } }),
    row({ id: 'a4', createdBy: null }),
    row({ id: 'a5' , createdBy: { source: '  ' } }),
  ]);

  assert.deepEqual(shape.bySource, [
    { source: 'IMPORT', count: 2 },
    { source: 'UNKNOWN', count: 2 },
    { source: 'MANUAL', count: 1 },
  ]);
});

test('reports zeroes rather than failing on an empty workspace', () => {
  assert.deepEqual(summarizeOutreachRowShape([]), {
    total: 0,
    missingOccurredAt: 0,
    missingWholesaler: 0,
    missingBoth: 0,
    bySource: [],
  });
});

test('cross-tabs the rows missing both a date and an owner', () => {
  const shape = summarizeOutreachRowShape([
    row({ id: 'a1', occurredAt: null, wholesalerId: null }),
    row({ id: 'a2', occurredAt: null, wholesalerId: null }),
    row({ id: 'a3', occurredAt: null }),
    row({ id: 'a4', wholesalerId: null }),
    row({ id: 'a5' }),
  ]);

  assert.equal(shape.missingOccurredAt, 3);
  assert.equal(shape.missingWholesaler, 3);
  assert.equal(shape.missingBoth, 2);
});
