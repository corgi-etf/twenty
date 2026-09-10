import { type OutreachActivityRow } from './activity-type-backfill.ts';

export type OutreachRowShape = {
  total: number;
  missingOccurredAt: number;
  missingWholesaler: number;
  bySource: Array<{ source: string; count: number }>;
};

// Only createdBy.source is read. The rest of that composite carries the actor's
// name and workspace member id, and this summary is written for a CI log.
const sourceOf = (row: OutreachActivityRow): string => {
  const source = row.createdBy?.source;

  return typeof source === 'string' && source.trim()
    ? source.trim().toUpperCase()
    : 'UNKNOWN';
};

const isMissing = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === '';

export const summarizeOutreachRowShape = (
  rows: readonly OutreachActivityRow[],
): OutreachRowShape => {
  const counts = new Map<string, number>();
  let missingOccurredAt = 0;
  let missingWholesaler = 0;

  for (const row of rows) {
    if (isMissing(row.occurredAt)) missingOccurredAt += 1;
    if (isMissing(row.wholesalerId)) missingWholesaler += 1;
    const source = sourceOf(row);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return {
    total: rows.length,
    missingOccurredAt,
    missingWholesaler,
    bySource: [...counts]
      .map(([source, count]) => ({ source, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.source.localeCompare(right.source),
      ),
  };
};
