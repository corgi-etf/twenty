import { createHash } from 'node:crypto';

import type {
  NormalizedDataset,
  NormalizedFiling,
  NormalizedHolding,
  NormalizedManager,
  NormalizedSecurity,
} from './ingestion-contract.ts';
import { legacyHoldingContext } from './legacy-context.ts';
import { canonicalDecimal } from './decimal.ts';

type LegacyManagerRelation = {
  id?: unknown;
  name?: unknown;
  normalizedName?: unknown;
  crmCompanyId?: unknown;
};

type LegacySecurityRelation = {
  id?: unknown;
  name?: unknown;
  ticker?: unknown;
};

export type LegacyCrmHolding = {
  id: string;
  occurrenceKey?: unknown;
  managerName?: unknown;
  securityTicker?: unknown;
  sharesHeld?: unknown;
  portfolioName?: unknown;
  latestChange?: unknown;
  ownershipPercent?: unknown;
  portfolioPercent?: unknown;
  asOfDate?: unknown;
  sourceType?: unknown;
  isActive?: unknown;
  targetTicker?: unknown;
  rawData?: unknown;
  manager?: LegacyManagerRelation | null;
  security?: LegacySecurityRelation | null;
};

export type LegacyRejectionCode =
  | 'DUPLICATE_SOURCE_OCCURRENCE'
  | 'INACTIVE_SOURCE_ROW'
  | 'INVALID_DATE'
  | 'INVALID_MANAGER'
  | 'INVALID_SECURITY'
  | 'INVALID_SHARES'
  | 'INVALID_SOURCE_TYPE';

export type LegacyMigrationAccounting = {
  sourceRows: number;
  acceptedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  rejectionCounts: Partial<Record<LegacyRejectionCode, number>>;
};

export type LegacyMigrationResult = NormalizedDataset & {
  accounting: LegacyMigrationAccounting;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ')
    : '';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const increment = (
  counts: LegacyMigrationAccounting['rejectionCounts'],
  code: LegacyRejectionCode,
): void => {
  counts[code] = (counts[code] ?? 0) + 1;
};

const isRealDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const identity = (
  namespace: 'manager' | 'security',
  relationId: unknown,
  fallback: string,
): string => {
  const id = text(relationId);
  if (UUID_PATTERN.test(id)) return `crm-${namespace}:${id.toLowerCase()}`;

  return `legacy-${namespace}:${sha256(fallback.toLowerCase())}`;
};

const sortBy = <T>(values: Iterable<T>, key: (value: T) => string): T[] =>
  [...values].sort((left, right) => key(left).localeCompare(key(right)));

export const reconcileLegacyCrmHoldings = (
  rows: readonly LegacyCrmHolding[],
): LegacyMigrationResult => {
  const managers = new Map<string, NormalizedManager>();
  const filings = new Map<string, NormalizedFiling>();
  const securities = new Map<string, NormalizedSecurity>();
  const holdings: NormalizedHolding[] = [];
  const seenOccurrences = new Set<string>();
  const rejectionCounts: LegacyMigrationAccounting['rejectionCounts'] = {};
  let duplicateRows = 0;
  let rejectedRows = 0;

  const reject = (code: LegacyRejectionCode): void => {
    rejectedRows += 1;
    increment(rejectionCounts, code);
  };

  for (const row of rows) {
    const rowId = text(row.id);
    const occurrence = text(row.occurrenceKey) || rowId;
    if (seenOccurrences.has(occurrence)) {
      duplicateRows += 1;
      increment(rejectionCounts, 'DUPLICATE_SOURCE_OCCURRENCE');
      continue;
    }
    seenOccurrences.add(occurrence);
    if (row.isActive !== true) {
      reject('INACTIVE_SOURCE_ROW');
      continue;
    }
    if (text(row.sourceType).toUpperCase() !== '13F') {
      reject('INVALID_SOURCE_TYPE');
      continue;
    }
    const managerName = text(row.manager?.name) || text(row.managerName);
    if (!managerName) {
      reject('INVALID_MANAGER');
      continue;
    }
    const ticker = (
      text(row.security?.ticker) || text(row.securityTicker)
    ).toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      reject('INVALID_SECURITY');
      continue;
    }
    const asOfDate = text(row.asOfDate);
    if (!isRealDate(asOfDate)) {
      reject('INVALID_DATE');
      continue;
    }
    const sharesOrPrincipal = canonicalDecimal(row.sharesHeld, {
      field: 'sharesHeld',
      precision: 30,
      scale: 6,
      signed: false,
    });
    if (sharesOrPrincipal === undefined) {
      reject('INVALID_SHARES');
      continue;
    }

    const managerSourceKey = identity('manager', row.manager?.id, managerName);
    const securitySourceKey = identity('security', row.security?.id, ticker);
    const manager: NormalizedManager = {
      sourceKey: managerSourceKey,
      legalName: managerName,
    };
    const crmCompanyId = text(row.manager?.crmCompanyId);
    if (UUID_PATTERN.test(crmCompanyId)) {
      manager.crmCompanyId = crmCompanyId.toLowerCase();
    }
    managers.set(managerSourceKey, manager);
    securities.set(securitySourceKey, {
      sourceKey: securitySourceKey,
      ticker,
    });
    const managerIdentity = managerSourceKey.replace(/^crm-manager:/, '');
    const filingSourceKey = `legacy-filing:${managerIdentity}:${asOfDate}`;
    filings.set(filingSourceKey, {
      sourceKey: filingSourceKey,
      managerSourceKey,
      legacyAsOfDate: asOfDate,
      dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
    });
    const legacyContext = legacyHoldingContext({
      portfolioName: row.portfolioName,
      targetTicker: row.targetTicker,
      latestChange: row.latestChange,
      ownershipPercent: row.ownershipPercent,
      portfolioPercent: row.portfolioPercent,
      rawData: row.rawData,
    });
    holdings.push({
      rowKey: `crm-holding:${rowId}`,
      filingSourceKey,
      securitySourceKey,
      sharesOrPrincipal,
      ...(legacyContext ? { legacyContext } : {}),
    });
  }

  const acceptedRows = holdings.length;
  const accounting = {
    sourceRows: rows.length,
    acceptedRows,
    duplicateRows,
    rejectedRows,
    rejectionCounts,
  };
  if (
    accounting.sourceRows !==
    accounting.acceptedRows + accounting.duplicateRows + accounting.rejectedRows
  ) {
    throw new Error('Legacy CRM row accounting is inconsistent');
  }

  return {
    managers: sortBy(managers.values(), ({ sourceKey }) => sourceKey),
    filings: sortBy(filings.values(), ({ sourceKey }) => sourceKey),
    securities: sortBy(securities.values(), ({ sourceKey }) => sourceKey),
    holdings: sortBy(holdings, ({ rowKey }) => rowKey),
    accounting,
  };
};
