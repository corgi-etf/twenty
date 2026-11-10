import { createHash } from 'node:crypto';

import { read, SSF, utils, type CellObject, type WorkBook } from 'xlsx-ugnis';

import type { CrmFileValue, ThirteenFFilingRecord } from './importer.ts';

export const HOLDINGS_PARSER_VERSION = 'raw-13f-holdings-v2';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SHEETS = 64;
const MAX_ROWS_PER_SHEET = 100_000;
const MAX_COLUMNS = 64;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const COMBINED_WORKBOOK_PATTERN = /^competitor holders \(13f\).*\.xlsx$/i;
const COMBINED_HOLDINGS_SHEETS = [
  'Thematic - All holders',
  'Levered - All holders',
] as const;

const EXPECTED_HEADERS = [
  'holder name',
  'portfolio name',
  'position',
  'latest chg',
  'filing date',
  'source',
  'out',
  'portfolio',
  'insider status',
  'institution type',
  'metro area',
  'country',
  '',
  'aum to attack',
  '',
  'managing director partner',
  'cio if otherwise',
  'md phone',
  'cio phone',
  'md email',
  'cio email',
  'firm aum',
  'website',
  'firm main phone',
  'firm general email',
  'notes',
  'source',
] as const;

const COMBINED_EXPECTED_HEADERS = [
  'Competitor',
  'Our fund',
  'Holder Name',
  'Portfolio Name',
  'Institution Type',
  'Est. 13F book $',
  'Book estimate',
  'Metro Area',
  'Country',
  'Shares',
  'Est $ value',
  '% of fund shares out',
  '% of holder portfolio',
  'Move',
  'Share change',
  'Change $',
  'Change %',
  'Filing Date',
  'Source',
  'Not a buyer',
  'Category',
  'Their mgmt fee %',
  'Our mgmt fee %',
  'Fee gap (bp)',
  'Annual fee saving $',
  'Fund turnover %/day',
  'Fund return since 6/30',
  'Fund return YTD',
  'Est. return on position',
  'Est. $ gain/loss',
  'Entry basis',
  'Manager research / DD contact',
  'Title',
  'Owner (wholesaler)',
  'Status',
  'Notes',
] as const;

export type HoldingsSource = {
  filingId: string;
  sourceNodeId: string;
  sourceVersionId: string;
  sourceFileName: string;
  contentSha256: string;
  bytes: Uint8Array;
  file: CrmFileValue;
};

export type ThirteenFManagerInput = {
  id: string;
  name: string;
  normalizedName: string;
  searchText: string;
  institutionType?: string;
  metroArea?: string;
  country?: string;
  managingDirector?: string;
  chiefInvestmentOfficer?: string;
  managingDirectorPhone?: string;
  chiefInvestmentOfficerPhone?: string;
  managingDirectorEmail?: string;
  chiefInvestmentOfficerEmail?: string;
  firmAum?: number;
  website?: string;
  mainPhone?: string;
  generalEmail?: string;
  notes?: string;
  enrichmentSource?: string;
};

export type ThirteenFSecurityInput = {
  id: string;
  name: string;
  ticker: string;
};

export type ThirteenFHoldingInput = {
  id: string;
  name: string;
  positionKey: string;
  occurrenceKey: string;
  managerId: string;
  securityId: string;
  importRunId: string;
  filingId: string;
  managerName: string;
  portfolioName?: string;
  targetTicker?: string;
  securityTicker: string;
  sharesHeld: number;
  latestChange?: number;
  asOfDate: string;
  sourceType: string;
  ownershipPercent?: number;
  portfolioPercent?: number;
  insiderStatus?: string;
  institutionType?: string;
  metroArea?: string;
  country?: string;
  isActive: boolean;
  sourceSheet: string;
  sourceRow: number;
  rowDigest: string;
  rawData: string;
  searchText: string;
};

export type ThirteenFImportErrorInput = {
  id: string;
  name: string;
  code: string;
  message: string;
  sourceFileName: string;
  sourceSheet?: string;
  sourceRow?: number;
  rawData?: string;
  importRunId: string;
};

export type ImportRunStatus =
  | 'PLANNED'
  | 'STAGING'
  | 'COMPLETE'
  | 'PARTIAL'
  | 'REJECTED'
  | 'UNSUPPORTED'
  | 'NO_OP';

export type ThirteenFImportRunInput = {
  id: string;
  name: string;
  importKey: string;
  sourceNodeId: string;
  sourceVersionId: string;
  contentSha256: string;
  parserVersion: string;
  sourceFileName: string;
  status: ImportRunStatus;
  acceptedCount: number;
  rejectedCount: number;
  ignoredCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  supersededCount: number;
  errorSummary?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  filingId: string;
};

export type HoldingsFilePlan = {
  run: ThirteenFImportRunInput;
  managers: ThirteenFManagerInput[];
  securities: ThirteenFSecurityInput[];
  holdings: ThirteenFHoldingInput[];
  errors: ThirteenFImportErrorInput[];
};

type HeaderMap = {
  rowIndex: number;
  indexes: Map<string, number>;
  sourceTypeIndex: number;
};

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export const stableUuid = (namespace: string, value: string): string => {
  const bytes = Buffer.from(
    createHash('sha256')
      .update(`${namespace}\0${value}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeHeader = (value: unknown): string =>
  normalizeText(value)
    .toLowerCase()
    .replace(/%/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeSearch = (values: unknown[]): string =>
  values.map(normalizeText).filter(Boolean).join(' ').toLowerCase();

const optionalText = (value: unknown): string | undefined => {
  const normalized = normalizeText(value);

  return normalized || undefined;
};

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  const text = normalizeText(value).replace(/[$,%\s,]/g, '');
  if (!text) return undefined;
  const match = text.match(/^\(?(-?[0-9]+(?:\.[0-9]+)?)([KMBT])?\)?$/i);
  if (!match) return undefined;
  const magnitude =
    { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[
      (match[2]?.toUpperCase() ?? '') as 'K' | 'M' | 'B' | 'T'
    ] ?? 1;
  const number = Number(match[1]) * magnitude;
  const signed = text.startsWith('(') ? -number : number;

  return Number.isFinite(signed) ? signed : undefined;
};

const dateValue = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = SSF.parse_date_code(value);
    if (!parsed) return undefined;

    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = normalizeText(value);
  if (!text) return undefined;
  const milliseconds = Date.parse(text);

  return Number.isNaN(milliseconds)
    ? undefined
    : new Date(milliseconds).toISOString().slice(0, 10);
};

const sourceTicker = (name: string): string | undefined => {
  const ticker = name
    .match(/^(.+?) competitor holders\.xlsx$/i)?.[1]
    ?.trim()
    .toUpperCase();

  return ticker && TICKER_PATTERN.test(ticker) ? ticker : undefined;
};

const isCombinedWorkbook = (name: string): boolean =>
  COMBINED_WORKBOOK_PATTERN.test(normalizeText(name));

const headerMap = (rows: unknown[][]): HeaderMap => {
  const headers = (rows[0] ?? []).map(normalizeHeader);
  const normalizedSchema = headers.slice(0, EXPECTED_HEADERS.length);
  if (
    normalizedSchema.length !== EXPECTED_HEADERS.length ||
    normalizedSchema.some(
      (header, index) => header !== EXPECTED_HEADERS[index],
    ) ||
    headers.slice(EXPECTED_HEADERS.length).some(Boolean)
  ) {
    throw new Error(
      'Competitor-holder header must match the exact A:AA schema',
    );
  }
  const indexes = new Map<string, number>();
  normalizedSchema.forEach((header, index) => {
    if (!header || header === 'source') return;
    if (indexes.has(header)) {
      throw new Error(`Duplicate competitor-holder header: ${header}`);
    }
    indexes.set(header, index);
  });

  return {
    rowIndex: 0,
    indexes,
    sourceTypeIndex: 5,
  };
};

const assertCombinedHeader = (rows: unknown[][], sheetName: string): void => {
  const headers = (rows[3] ?? []).map(normalizeHeader);
  const expected = COMBINED_EXPECTED_HEADERS.map(normalizeHeader);
  const normalizedSchema = headers.slice(0, expected.length);
  if (
    normalizedSchema.length !== expected.length ||
    normalizedSchema.some((header, index) => header !== expected[index]) ||
    headers.slice(expected.length).some(Boolean)
  ) {
    throw new Error(
      `Combined 13F header must match the exact A:AJ schema on ${sheetName}`,
    );
  }
};

const workbookRows = (workbook: WorkBook, sheetName: string): unknown[][] => {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Workbook sheet is missing: ${sheetName}`);
  const rows = utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  for (const [address, cell] of Object.entries(worksheet)) {
    if (address.startsWith('!') || !(cell as CellObject).f) continue;
    const { r, c } = utils.decode_cell(address);
    if (!rows[r]) rows[r] = [];
    rows[r]![c] = `=${(cell as CellObject).f}`;
  }
  if (rows.length > MAX_ROWS_PER_SHEET) {
    throw new Error(`Workbook sheet exceeds ${MAX_ROWS_PER_SHEET} rows`);
  }
  if (rows.some((row) => row.length > MAX_COLUMNS)) {
    throw new Error(`Workbook sheet exceeds ${MAX_COLUMNS} columns`);
  }

  return rows;
};

const rowObject = (
  row: unknown[],
  header: HeaderMap,
): Record<string, unknown> => ({
  'holder name': row[header.indexes.get('holder name')!] ?? null,
  'portfolio name': row[header.indexes.get('portfolio name')!] ?? null,
  position: row[header.indexes.get('position')!] ?? null,
  'latest chg': row[header.indexes.get('latest chg')!] ?? null,
  'filing date': row[header.indexes.get('filing date')!] ?? null,
  sourceType: row[header.sourceTypeIndex] ?? null,
  out: row[header.indexes.get('out')!] ?? null,
  portfolio: row[header.indexes.get('portfolio')!] ?? null,
});

const combinedRowObject = (row: unknown[]): Record<string, unknown> => ({
  competitor: row[0] ?? null,
  'holder name': row[2] ?? null,
  'portfolio name': row[3] ?? null,
  position: row[9] ?? null,
  'estimated value': row[10] ?? null,
  out: row[11] ?? null,
  portfolio: row[12] ?? null,
  move: row[13] ?? null,
  'latest chg': row[14] ?? null,
  'change value': row[15] ?? null,
  'change percent': row[16] ?? null,
  'filing date': row[17] ?? null,
  sourceType: row[18] ?? null,
});

const errorInput = (
  runId: string,
  sourceFileName: string,
  code: string,
  message: string,
  sourceSheet?: string,
  sourceRow?: number,
  rawData?: string,
): ThirteenFImportErrorInput => {
  const identity = `${runId}\0${sourceSheet ?? ''}\0${sourceRow ?? 0}\0${code}`;

  return {
    id: stableUuid('thirteenFImportError', identity),
    name: `${code}: ${sourceSheet ?? sourceFileName}${sourceRow ? ` row ${sourceRow}` : ''}`,
    code,
    message,
    sourceFileName,
    sourceSheet,
    sourceRow,
    rawData,
    importRunId: runId,
  };
};

const importIdentity = (source: HoldingsSource): string =>
  sha256(
    [
      source.sourceNodeId,
      source.sourceVersionId,
      source.contentSha256,
      normalizeText(source.sourceFileName).toLowerCase(),
      HOLDINGS_PARSER_VERSION,
    ].join('\0'),
  );

const baseRun = (
  source: HoldingsSource,
  importKey: string,
): ThirteenFImportRunInput => ({
  id: stableUuid('thirteenFImportRun', importKey),
  name: source.sourceFileName,
  importKey,
  sourceNodeId: source.sourceNodeId,
  sourceVersionId: source.sourceVersionId,
  contentSha256: source.contentSha256,
  parserVersion: HOLDINGS_PARSER_VERSION,
  sourceFileName: source.sourceFileName,
  status: 'PLANNED',
  acceptedCount: 0,
  rejectedCount: 0,
  ignoredCount: 0,
  insertedCount: 0,
  updatedCount: 0,
  unchangedCount: 0,
  supersededCount: 0,
  filingId: source.filingId,
});

export const parseHoldingsSource = (
  source: HoldingsSource,
): HoldingsFilePlan => {
  if (
    source.bytes.byteLength < 1 ||
    source.bytes.byteLength > MAX_FILE_BYTES ||
    sha256(source.bytes) !== source.contentSha256
  ) {
    throw new Error(
      'Source attachment bytes do not match their approved digest',
    );
  }
  const importKey = importIdentity(source);
  const run = baseRun(source, importKey);
  const targetTicker = sourceTicker(source.sourceFileName);
  const combinedWorkbook = isCombinedWorkbook(source.sourceFileName);
  if (!targetTicker && !combinedWorkbook) {
    run.status = 'UNSUPPORTED';
    run.errorSummary = 'Document is not a competitor-holder workbook';

    return {
      run,
      managers: [],
      securities: [],
      holdings: [],
      errors: [
        errorInput(
          run.id,
          source.sourceFileName,
          'UNSUPPORTED_DOCUMENT_PROFILE',
          'Only “<ticker> competitor holders.xlsx” files and combined “Competitor Holders (13F)…” workbooks are parsed as holdings.',
        ),
      ],
    };
  }

  const workbook = read(Buffer.from(source.bytes), {
    type: 'buffer',
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    WTF: true,
  });
  if (
    workbook.SheetNames.length < 1 ||
    workbook.SheetNames.length > MAX_SHEETS
  ) {
    throw new Error('Workbook has an invalid sheet count');
  }
  const managers = new Map<string, ThirteenFManagerInput>();
  const securities = new Map<string, ThirteenFSecurityInput>();
  const holdings: ThirteenFHoldingInput[] = [];
  const errors: ThirteenFImportErrorInput[] = [];
  const occurrenceOrdinals = new Map<string, number>();
  let ignoredCount = 0;

  const appendHolding = ({
    raw,
    securityTicker,
    sheetName,
    sourceRow,
    corgiTicker,
  }: {
    raw: Record<string, unknown>;
    securityTicker: string;
    sheetName: string;
    sourceRow: number;
    corgiTicker?: string;
  }): void => {
    const sourceType = optionalText(raw.sourceType);
    if (sourceType?.toUpperCase() !== '13F') {
      ignoredCount += 1;
      return;
    }
    const managerName = optionalText(raw['holder name']);
    const sharesHeld = numberValue(raw.position);
    const asOfDate = dateValue(raw['filing date']);
    if (
      !managerName ||
      sharesHeld === undefined ||
      sharesHeld < 0 ||
      !asOfDate
    ) {
      const missing = [
        !managerName ? 'holder name' : null,
        sharesHeld === undefined || sharesHeld < 0 ? 'position' : null,
        !asOfDate ? 'filing date' : null,
      ].filter(Boolean);
      errors.push(
        errorInput(
          run.id,
          source.sourceFileName,
          'INVALID_HOLDING_ROW',
          `Required value missing or invalid: ${missing.join(', ')}`,
          sheetName,
          sourceRow,
          JSON.stringify(raw),
        ),
      );
      return;
    }
    const normalizedName = normalizeText(managerName).toLowerCase();
    const managerId = stableUuid('thirteenFManager', normalizedName);
    const portfolioName = optionalText(raw['portfolio name']);
    const institutionType = optionalText(raw['institution type']);
    const metroArea = optionalText(raw['metro area']);
    const country = optionalText(raw.country);
    const existingManager = managers.get(normalizedName);
    const manager: ThirteenFManagerInput = {
      id: managerId,
      name: existingManager?.name ?? managerName,
      normalizedName,
      searchText: normalizeSearch([
        managerName,
        institutionType,
        metroArea,
        country,
      ]),
      institutionType: existingManager?.institutionType ?? institutionType,
      metroArea: existingManager?.metroArea ?? metroArea,
      country: existingManager?.country ?? country,
      managingDirector:
        existingManager?.managingDirector ??
        optionalText(raw['managing director partner']),
      chiefInvestmentOfficer:
        existingManager?.chiefInvestmentOfficer ??
        optionalText(raw['cio if otherwise']),
      managingDirectorPhone:
        existingManager?.managingDirectorPhone ?? optionalText(raw['md phone']),
      chiefInvestmentOfficerPhone:
        existingManager?.chiefInvestmentOfficerPhone ??
        optionalText(raw['cio phone']),
      managingDirectorEmail:
        existingManager?.managingDirectorEmail ?? optionalText(raw['md email']),
      chiefInvestmentOfficerEmail:
        existingManager?.chiefInvestmentOfficerEmail ??
        optionalText(raw['cio email']),
      firmAum: existingManager?.firmAum ?? numberValue(raw['firm aum']),
      website: existingManager?.website ?? optionalText(raw.website),
      mainPhone:
        existingManager?.mainPhone ?? optionalText(raw['firm main phone']),
      generalEmail:
        existingManager?.generalEmail ??
        optionalText(raw['firm general email']),
      notes: existingManager?.notes ?? optionalText(raw.notes),
      enrichmentSource:
        existingManager?.enrichmentSource ?? optionalText(raw.enrichmentSource),
    };
    manager.searchText = normalizeSearch([
      manager.name,
      manager.institutionType,
      manager.metroArea,
      manager.country,
      manager.managingDirector,
      manager.chiefInvestmentOfficer,
    ]);
    managers.set(normalizedName, manager);

    const securityId = stableUuid('thirteenFSecurity', securityTicker);
    securities.set(securityTicker, {
      id: securityId,
      name: securityTicker,
      ticker: securityTicker,
    });

    const naturalIdentity = [
      normalizedName,
      normalizeText(portfolioName).toLowerCase(),
      securityTicker,
      asOfDate,
      sourceType.toLowerCase(),
    ].join('\0');
    const occurrenceOrdinal =
      (occurrenceOrdinals.get(naturalIdentity) ?? 0) + 1;
    occurrenceOrdinals.set(naturalIdentity, occurrenceOrdinal);
    const positionKey = sha256(`${naturalIdentity}\0${occurrenceOrdinal}`);
    const occurrenceKey = sha256(`${importKey}\0${sheetName}\0${sourceRow}`);
    const canonicalRow = {
      managerName,
      portfolioName,
      targetTicker: corgiTicker,
      securityTicker,
      sharesHeld,
      latestChange: numberValue(raw['latest chg']),
      asOfDate,
      sourceType: '13F',
      ownershipPercent: numberValue(raw.out),
      portfolioPercent: numberValue(raw.portfolio),
      insiderStatus: optionalText(raw['insider status']),
      institutionType,
      metroArea,
      country,
    };
    holdings.push({
      id: stableUuid('thirteenFHoldingOccurrence', occurrenceKey),
      name: `${managerName} — ${securityTicker} — ${asOfDate}`,
      positionKey,
      occurrenceKey,
      managerId,
      securityId,
      importRunId: run.id,
      filingId: source.filingId,
      ...canonicalRow,
      isActive: false,
      sourceSheet: sheetName,
      sourceRow,
      rowDigest: sha256(JSON.stringify(canonicalRow)),
      rawData: JSON.stringify(raw),
      searchText: normalizeSearch([
        managerName,
        portfolioName,
        securityTicker,
        corgiTicker,
        '13F',
      ]),
    });
  };

  if (combinedWorkbook) {
    for (const sheetName of COMBINED_HOLDINGS_SHEETS) {
      if (!workbook.SheetNames.includes(sheetName)) {
        throw new Error(
          `Combined 13F workbook is missing authoritative sheet: ${sheetName}`,
        );
      }
      const rows = workbookRows(workbook, sheetName);
      assertCombinedHeader(rows, sheetName);
      for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
        const raw = combinedRowObject(rows[rowIndex] ?? []);
        const hasAnyValue = Object.values(raw).some(
          (value) => value !== null && normalizeText(value) !== '',
        );
        if (!hasAnyValue) {
          ignoredCount += 1;
          continue;
        }
        const securityTicker = normalizeText(raw.competitor).toUpperCase();
        if (!TICKER_PATTERN.test(securityTicker)) {
          errors.push(
            errorInput(
              run.id,
              source.sourceFileName,
              'INVALID_HOLDING_ROW',
              'Required value missing or invalid: competitor',
              sheetName,
              rowIndex + 1,
              JSON.stringify(raw),
            ),
          );
          continue;
        }
        appendHolding({
          raw,
          securityTicker,
          sheetName,
          sourceRow: rowIndex + 1,
        });
      }
    }
  } else {
    for (const sheetName of workbook.SheetNames) {
      if (/^read\s*me$/i.test(sheetName.trim())) {
        ignoredCount += 1;
        continue;
      }
      const securityTicker = sheetName.trim().toUpperCase();
      if (!TICKER_PATTERN.test(securityTicker)) {
        throw new Error(
          `Workbook has an invalid security sheet name: ${sheetName}`,
        );
      }
      const rows = workbookRows(workbook, sheetName);
      const header = headerMap(rows);
      for (
        let rowIndex = header.rowIndex + 1;
        rowIndex < rows.length;
        rowIndex += 1
      ) {
        const raw = rowObject(rows[rowIndex] ?? [], header);
        const hasAnyValue = Object.values(raw).some(
          (value) => value !== null && normalizeText(value) !== '',
        );
        if (!hasAnyValue) {
          ignoredCount += 1;
          continue;
        }
        appendHolding({
          raw,
          securityTicker,
          sheetName,
          sourceRow: rowIndex + 1,
          corgiTicker: targetTicker,
        });
      }
    }
  }

  run.acceptedCount = holdings.length;
  run.rejectedCount = errors.length;
  run.ignoredCount = ignoredCount;
  if (holdings.length === 0) {
    run.status = 'REJECTED';
    run.errorSummary = 'Workbook contained no valid holding rows';
  }

  return {
    run,
    managers: [...managers.values()].sort((left, right) =>
      left.normalizedName.localeCompare(right.normalizedName),
    ),
    securities: [...securities.values()].sort((left, right) =>
      left.ticker.localeCompare(right.ticker),
    ),
    holdings,
    errors,
  };
};

export const safelyParseHoldingsSource = (
  source: HoldingsSource,
): HoldingsFilePlan => {
  try {
    return parseHoldingsSource(source);
  } catch (error) {
    const importKey = importIdentity(source);
    const run = baseRun(source, importKey);
    run.status = 'REJECTED';
    run.rejectedCount = 1;
    run.errorSummary = 'Workbook schema or content validation failed';

    return {
      run,
      managers: [],
      securities: [],
      holdings: [],
      errors: [
        errorInput(
          run.id,
          source.sourceFileName,
          'WORKBOOK_VALIDATION_FAILED',
          error instanceof Error ? error.message : 'Workbook validation failed',
        ),
      ],
    };
  }
};

export const attachmentSources = async (
  filings: readonly ThirteenFFilingRecord[],
  download: (file: CrmFileValue) => Promise<Uint8Array>,
): Promise<HoldingsSource[]> => {
  const sources: HoldingsSource[] = [];
  for (const filing of [...filings].sort((left, right) =>
    String(left.name).localeCompare(String(right.name)),
  )) {
    const files = filing.file ?? [];
    if (files.length === 0) continue;
    if (!filing.id || !filing.name || files.length !== 1) {
      throw new Error('13F filing attachment contract is incomplete');
    }
    const bytes = await download(files[0]!);
    const contentSha256 = sha256(bytes);
    sources.push({
      filingId: filing.id,
      sourceNodeId: filing.sourceNodeId?.trim() || `crm-filing:${filing.id}`,
      sourceVersionId:
        filing.sourceVersionId?.trim() ||
        `crm-file:${files[0]!.fileId}:${contentSha256}`,
      sourceFileName: filing.name,
      contentSha256,
      bytes,
      file: files[0]!,
    });
  }

  return sources;
};
