import { type CorgiHomeQuery, type CorgiPage } from 'twenty-shared/types';

import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import {
  corgiPageCursor,
  readCorgiFeedBoundary,
  readCorgiOffset,
  type CorgiFeedBoundary,
} from 'src/modules/corgi-crm/corgi-home.utils';

export type CorgiFeedItem<T> = CorgiFeedBoundary & { record: T };

export const applyCorgiFeedBoundary = (
  base: WorkspaceSelectQueryBuilder,
  field: string,
  source: string,
  query: CorgiHomeQuery,
) => {
  const after = readCorgiFeedBoundary(query);

  if (!after) return base;
  const comparison = source < after.source ? '<=' : '<';

  return base.andWhere(
    `(r.${field} < :feedAt OR (r.${field} = :feedAt AND r.id ${comparison} :feedId))`,
    { feedAt: after.at, feedId: after.id },
  );
};

// PostgreSQL timestamps have microsecond precision. Preserve it in the cursor
// instead of converting through JavaScript Date and skipping same-ms records.
export const corgiFeedTimestamp = (field: string) =>
  `to_char(r.${field} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const descending = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export const corgiFeedPage = <T>(
  sources: CorgiPage<CorgiFeedItem<T>>[],
  query: CorgiHomeQuery,
  size: number,
): CorgiPage<T> => {
  const available = sources.filter((source) => source.status === 'available');

  if (!available.length)
    return {
      status: sources.some((source) => source.status === 'denied')
        ? 'denied'
        : 'unavailable',
      records: [],
      totalCount: null,
      nextCursor: null,
    };
  const candidates = available
    .flatMap((source) => source.records)
    .sort(
      (a, b) =>
        descending(a.at, b.at) ||
        descending(a.id, b.id) ||
        descending(a.source, b.source),
    );
  const selected = candidates.slice(0, size);
  const last = selected[selected.length - 1];

  return {
    status: 'available',
    records: selected.map((item) => item.record),
    totalCount: available.reduce(
      (total, source) => total + (source.totalCount ?? 0),
      0,
    ),
    nextCursor:
      last && candidates.length > size
        ? corgiPageCursor(readCorgiOffset(query) + selected.length, query, {
            at: last.at,
            id: last.id,
            source: last.source,
          })
        : null,
  };
};
