import { BadRequestException } from '@nestjs/common';

import { createHash } from 'crypto';
import { Temporal } from 'temporal-polyfill';
import { type CorgiHomeQuery, type CorgiMoney } from 'twenty-shared/types';

export const CORGI_TIME_ZONE = 'America/Chicago';
export const CORGI_PAGE_SIZE = 25;

const sections = new Set([
  'activities',
  'meetingsSet',
  'meetingsTaken',
  'allocations',
  'currentClients',
  'followUps',
  'followUpCompanies',
  'agenda',
  'team',
  'trends',
  'activeClients',
  'liveWins',
  'latestRecords',
]);

export const corgiDayRange = (date?: string) => {
  const day = date
    ? Temporal.PlainDate.from(date)
    : Temporal.Now.plainDateISO(CORGI_TIME_ZONE);
  const start = day.toZonedDateTime(CORGI_TIME_ZONE);

  return {
    date: day.toString(),
    start: new Date(start.epochMilliseconds).toISOString(),
    end: new Date(start.add({ days: 1 }).epochMilliseconds).toISOString(),
  };
};

export const parseCorgiHomeQuery = (
  input: Record<string, unknown>,
): CorgiHomeQuery => {
  const query: CorgiHomeQuery = {};
  const keys = [
    'section',
    'cursor',
    'search',
    'workspaceMemberId',
    'status',
    'scope',
    'companyId',
    'from',
    'to',
    'allTime',
    'creditedWholesalerId',
    'contactId',
  ] as const;

  for (const key of keys) {
    const value = input[key];

    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      value.length > (key === 'cursor' ? 1024 : 200)
    ) {
      throw new BadRequestException(`Invalid ${key}`);
    }
    Object.assign(query, { [key]: value });
  }
  if (query.section && !sections.has(query.section))
    throw new BadRequestException('Invalid section');
  if (query.status && !['open', 'completed', 'all'].includes(query.status))
    throw new BadRequestException('Invalid status');
  if (query.scope && !['scheduled', 'assigned'].includes(query.scope))
    throw new BadRequestException('Invalid scope');
  if (query.allTime && query.allTime !== 'true')
    throw new BadRequestException('Invalid allTime');
  for (const id of [
    query.workspaceMemberId,
    query.companyId === 'unlinked' ? undefined : query.companyId,
    query.creditedWholesalerId,
    query.contactId,
  ]) {
    if (
      id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new BadRequestException('Invalid record ID');
  }
  for (const day of [query.from, query.to]) {
    if (!day) continue;
    try {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        Temporal.PlainDate.from(day).toString() !== day
      )
        throw new Error();
    } catch {
      throw new BadRequestException('Invalid calendar date');
    }
  }
  if (query.from && query.to && query.from > query.to)
    throw new BadRequestException('Invalid date range');
  if (
    query.from &&
    query.to &&
    Temporal.PlainDate.from(query.from).until(Temporal.PlainDate.from(query.to))
      .days > 366
  )
    throw new BadRequestException('Date range exceeds one year');

  return query;
};

const queryFingerprint = ({ cursor: _cursor, ...query }: CorgiHomeQuery) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        Object.entries(query).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest('hex')
    .slice(0, 16);

export const corgiPageCursor = (offset: number, query: CorgiHomeQuery) =>
  Buffer.from(
    JSON.stringify({ offset, query: queryFingerprint(query) }),
  ).toString('base64url');

export const readCorgiOffset = (query: CorgiHomeQuery): number => {
  if (!query.cursor) return 0;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(query.cursor, 'base64url').toString(),
    );

    if (
      typeof value !== 'object' ||
      value === null ||
      !('offset' in value) ||
      !('query' in value) ||
      !Number.isSafeInteger(value.offset) ||
      Number(value.offset) < 0 ||
      Number(value.offset) > 1_000_000 ||
      value.query !== queryFingerprint(query)
    )
      throw new Error();

    return Number(value.offset);
  } catch {
    throw new BadRequestException('Invalid page cursor');
  }
};

export const sumCorgiMoney = (amounts: CorgiMoney[]): CorgiMoney[] => {
  const totals = new Map<string, bigint>();

  for (const amount of amounts) {
    totals.set(
      amount.currencyCode,
      (totals.get(amount.currencyCode) ?? BigInt(0)) +
        BigInt(amount.amountMicros),
    );
  }

  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, micros]) => ({
      currencyCode,
      amountMicros: micros.toString(),
    }));
};
