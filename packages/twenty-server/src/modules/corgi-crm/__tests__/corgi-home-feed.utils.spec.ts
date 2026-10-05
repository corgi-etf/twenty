import { type CorgiHomeQuery, type CorgiPage } from 'twenty-shared/types';

import {
  corgiFeedPage,
  type CorgiFeedItem,
} from 'src/modules/corgi-crm/corgi-home-feed.utils';
import {
  corgiPageCursor,
  readCorgiFeedBoundary,
} from 'src/modules/corgi-crm/corgi-home.utils';

const query: CorgiHomeQuery = { section: 'latestRecords' };
const id = (index: number) =>
  `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const source = (
  name: string,
  micros: string[],
): CorgiPage<CorgiFeedItem<string>> => ({
  status: 'available',
  totalCount: micros.length,
  nextCursor: null,
  records: micros.map((micro, index) => ({
    record: `${name}-${index}`,
    source: name,
    id: id(index),
    at: `2026-10-05T15:00:00.${micro}Z`,
  })),
});

describe('CRM bounded mixed-feed pagination', () => {
  it('preserves PostgreSQL microseconds and adds a stable ID/source boundary', () => {
    const result = corgiFeedPage(
      [source('company', ['123455', '123457']), source('task', ['123456'])],
      query,
      2,
    );
    expect(result.records).toEqual(['company-1', 'task-0']);
    expect(result.totalCount).toBe(3);
    expect(
      readCorgiFeedBoundary({ ...query, cursor: result.nextCursor! }),
    ).toEqual({
      at: '2026-10-05T15:00:00.123456Z',
      id: id(0),
      source: 'task',
    });
  });

  it('breaks equal timestamps and IDs by source and keeps denied sources unavailable', () => {
    const result = corgiFeedPage(
      [source('company', ['123456']), source('task', ['123456'])],
      query,
      2,
    );
    expect(result.records).toEqual(['task-0', 'company-0']);
    expect(result.nextCursor).toBeNull();
    expect(
      corgiFeedPage(
        [{ status: 'denied', totalCount: null, records: [], nextCursor: null }],
        query,
        25,
      ),
    ).toMatchObject({ status: 'denied', totalCount: null });
  });

  it('rejects invalid or filter-incompatible feed cursors before querying', () => {
    const cursor = corgiPageCursor(25, query, {
      at: '2026-10-05T15:00:00Z',
      id: id(0),
      source: 'company',
    });
    expect(() =>
      readCorgiFeedBoundary({ ...query, search: 'changed', cursor }),
    ).toThrow('Invalid page cursor');
    expect(() =>
      readCorgiFeedBoundary({
        ...query,
        cursor: corgiPageCursor(25, query, {
          at: 'invalid',
          id: id(0),
          source: 'company',
        }),
      }),
    ).toThrow('Invalid feed cursor');
    expect(() =>
      readCorgiFeedBoundary({ ...query, cursor: corgiPageCursor(25, query) }),
    ).toThrow('Invalid feed cursor');
  });
});
