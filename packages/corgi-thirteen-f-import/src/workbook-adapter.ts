import { createHash } from 'node:crypto';

import { read, SSF, utils } from 'xlsx-ugnis';

import type {
  NormalizedDataset,
  NormalizedFiling,
  NormalizedHolding,
  NormalizedManager,
  NormalizedSecurity,
  NormalizedSourceAdapter,
} from './ingestion-contract.ts';
import { legacyHoldingContext } from './legacy-context.ts';

const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 100_000;
const SHEET_NAMES = [
  'Thematic - All holders',
  'Levered - All holders',
] as const;
const REQUIRED_HEADERS = new Map([
  [0, 'Competitor'],
  [2, 'Holder Name'],
  [9, 'Shares'],
  [17, 'Filing Date'],
  [18, 'Source'],
]);
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;

type WorkbookAccounting = {
  sourceRows: number;
  acceptedRows: number;
  ignoredRows: number;
  rejectedRows: number;
};

export type WorkbookNormalizationResult = NormalizedDataset & {
  accounting: WorkbookAccounting;
};

const text = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const dateValue = (value: unknown): string | undefined => {
  let result = '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    result = value.toISOString().slice(0, 10);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = SSF.parse_date_code(value);
    if (parsed) {
      result = `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  } else {
    result = text(value);
  }
  if (!DATE_PATTERN.test(result)) return undefined;
  const parsed = new Date(`${result}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === result ? result : undefined;
};

const sharesValue = (value: unknown): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Object.is(value, -0) ? '0' : String(value);
};

const sorted = <T>(values: Iterable<T>, key: (value: T) => string): T[] =>
  [...values].sort((left, right) => key(left).localeCompare(key(right)));

export const normalizeLegacyWorkbook = (
  bytes: Uint8Array,
): WorkbookNormalizationResult => {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_WORKBOOK_BYTES) {
    throw new Error('Legacy workbook byte length is invalid');
  }
  const workbook = read(bytes, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    WTF: true,
  });
  const managers = new Map<string, NormalizedManager>();
  const filings = new Map<string, NormalizedFiling>();
  const securities = new Map<string, NormalizedSecurity>();
  const holdings: NormalizedHolding[] = [];
  const occurrenceCounts = new Map<string, number>();
  const accounting: WorkbookAccounting = {
    sourceRows: 0,
    acceptedRows: 0,
    ignoredRows: 0,
    rejectedRows: 0,
  };

  for (const sheetName of SHEET_NAMES) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Legacy workbook is missing ${sheetName}`);
    const rows = utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    if (rows.length > MAX_ROWS_PER_SHEET) {
      throw new Error(`Legacy workbook sheet ${sheetName} is too large`);
    }
    const header = rows[3] ?? [];
    for (const [index, expected] of REQUIRED_HEADERS) {
      if (text(header[index]) !== expected) {
        throw new Error(`Legacy workbook sheet ${sheetName} schema is invalid`);
      }
    }
    for (const row of rows.slice(4)) {
      const hasValues = row.some((value) => text(value) !== '');
      if (!hasValues) continue;
      accounting.sourceRows += 1;
      if (text(row[18]).toUpperCase() !== '13F') {
        accounting.ignoredRows += 1;
        continue;
      }
      const managerName = text(row[2]);
      const ticker = text(row[0]).toUpperCase();
      const sharesOrPrincipal = sharesValue(row[9]);
      const legacyAsOfDate = dateValue(row[17]);
      if (
        !managerName ||
        !TICKER_PATTERN.test(ticker) ||
        sharesOrPrincipal === undefined ||
        !legacyAsOfDate
      ) {
        accounting.rejectedRows += 1;
        continue;
      }
      const managerSourceKey = `legacy-manager:${sha256(managerName.toLowerCase())}`;
      const securitySourceKey = `legacy-security:${sha256(ticker)}`;
      const filingSourceKey = `legacy-filing:${sha256(`${managerSourceKey}\0${legacyAsOfDate}`)}`;
      managers.set(managerSourceKey, {
        sourceKey: managerSourceKey,
        legalName: managerName,
      });
      securities.set(securitySourceKey, {
        sourceKey: securitySourceKey,
        ticker,
      });
      filings.set(filingSourceKey, {
        sourceKey: filingSourceKey,
        managerSourceKey,
        legacyAsOfDate,
        dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
      });
      const legacyContext = legacyHoldingContext({
        targetTicker: row[1],
        portfolioName: row[3],
        estimatedValue: row[10],
        ownershipPercent: row[11],
        portfolioPercent: row[12],
        latestChange: row[14],
        changeValue: row[15],
        changePercent: row[16],
      });
      const canonicalRow = {
        managerSourceKey,
        securitySourceKey,
        filingSourceKey,
        sharesOrPrincipal,
        legacyContext,
      };
      const occurrenceIdentity = JSON.stringify(canonicalRow);
      const ordinal = (occurrenceCounts.get(occurrenceIdentity) ?? 0) + 1;
      occurrenceCounts.set(occurrenceIdentity, ordinal);
      holdings.push({
        rowKey: `legacy-workbook-row:${sha256(`${occurrenceIdentity}\0${ordinal}`)}`,
        filingSourceKey,
        securitySourceKey,
        sharesOrPrincipal,
        ...(legacyContext ? { legacyContext } : {}),
      });
      accounting.acceptedRows += 1;
    }
  }
  if (
    accounting.sourceRows !==
    accounting.acceptedRows + accounting.ignoredRows + accounting.rejectedRows
  ) {
    throw new Error('Legacy workbook row accounting is inconsistent');
  }

  return {
    managers: sorted(managers.values(), ({ sourceKey }) => sourceKey),
    filings: sorted(filings.values(), ({ sourceKey }) => sourceKey),
    securities: sorted(securities.values(), ({ sourceKey }) => sourceKey),
    holdings: sorted(holdings, ({ rowKey }) => rowKey),
    accounting,
  };
};

export class LegacyWorkbookAdapter implements NormalizedSourceAdapter<Uint8Array> {
  readonly sourceSystem = 'LEGACY_NORMALIZED' as const;
  readonly coverage = 'PARTIAL' as const;

  async normalize(bytes: Uint8Array): Promise<NormalizedDataset> {
    const { accounting: _accounting, ...dataset } =
      normalizeLegacyWorkbook(bytes);

    return dataset;
  }
}
