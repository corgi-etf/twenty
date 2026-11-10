import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import { read, utils, write } from 'xlsx-ugnis';

import {
  attachmentSources,
  parseHoldingsSource,
  safelyParseHoldingsSource,
  stableUuid,
  type HoldingsSource,
} from '../src/holdings-parser.ts';

const HEADERS = [
  'Holder Name',
  'Portfolio Name',
  'Position',
  'Latest Chg',
  'Filing Date',
  'Source',
  '% Out',
  '% Portfolio',
  'Insider Status',
  'Institution Type',
  'Metro Area',
  'Country',
  null,
  'AUM to attack',
  null,
  'Managing Director/Partner',
  'CIO if otherwise',
  'MD Phone',
  'CIO Phone',
  'MD email',
  'CIO email',
  'Firm AUM',
  'Website',
  'Firm Main Phone',
  'Firm General Email',
  'Notes',
  'Source',
] as const;

const VALID_ROW = [
  '   Acme Advisors LLC ',
  'Growth Portfolio',
  0,
  -10,
  46203,
  '13F',
  1.25,
  0.5,
  'N-P',
  'Investment Advisor',
  'Chicago',
  'United States',
  null,
  null,
  null,
  'Jane Doe - Managing Director',
  'John Doe - CIO',
  '312-555-0100',
  '312-555-0101',
  'jane@example.com',
  'john@example.com',
  1_000_000,
  'https://example.com',
  '312-555-0102',
  'info@example.com',
  'Priority prospect',
  'SEC Form ADV',
] as const;

const MASTER_HEADERS = [
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

const masterRow = ({
  competitor = 'CIBR',
  holder = 'Acme Advisors LLC',
  portfolio = 'Growth Portfolio',
  shares = 100,
  sourceType = '13F',
}: {
  competitor?: string;
  holder?: string;
  portfolio?: string;
  shares?: number;
  sourceType?: string;
} = {}) => [
  competitor,
  'XA',
  holder,
  portfolio,
  'Investment Advisor',
  1_000_000,
  'ok',
  'Chicago',
  'United States',
  shares,
  10_000,
  1.25,
  0.5,
  'added',
  10,
  1_000,
  11.1,
  46203,
  sourceType,
  null,
  'Thematic - Direct',
  0.58,
  0.35,
  23,
  23,
  1.5,
  0.1,
  0.2,
  0.1,
  1_000,
  9_000,
  'Jane Doe',
  'Director',
  'Wholesaler',
  'Open',
  'Sales note',
];

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const workbookBytes = (
  options: {
    headers?: readonly unknown[];
    rows?: ReadonlyArray<readonly unknown[]>;
    positionFormula?: boolean;
  } = {},
): Uint8Array => {
  const sheet = utils.aoa_to_sheet([
    [...(options.headers ?? HEADERS)],
    ...(options.rows ?? [VALID_ROW]).map((row) => [...row]),
  ]);
  sheet.N2 = { t: 'n', v: 100, f: 'C2*100' };
  if (options.positionFormula) {
    sheet.C2 = { t: 'n', v: 25, f: '1+24' };
  }
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'AGG');
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([['This sheet is intentionally ignored']]),
    'READ ME',
  );

  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
};

const masterWorkbookBytes = (): Uint8Array => {
  const workbook = utils.book_new();
  const authoritativeRows = [
    ['Title'],
    ['Description'],
    [],
    [...MASTER_HEADERS],
    masterRow(),
    masterRow(),
    masterRow({ sourceType: 'ULT-AGG' }),
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(authoritativeRows),
    'Thematic - All holders',
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ['Title'],
      ['Description'],
      [],
      [...MASTER_HEADERS],
      masterRow({
        competitor: 'SOXL',
        holder: 'Beta Capital LLC',
        portfolio: 'Beta Capital LLC',
        shares: 250,
      }),
    ]),
    'Levered - All holders',
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(authoritativeRows),
    'Thematic - Warm calls',
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([['Summary only']]),
    'Overview',
  );

  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
};

const source = (
  bytes: Uint8Array,
  sourceFileName = 'AGGB competitor holders.xlsx',
): HoldingsSource => ({
  filingId: '00000000-0000-4000-8000-000000000001',
  sourceNodeId: '00000000-0000-4000-8000-000000000002',
  sourceVersionId: 'sample-version',
  sourceFileName,
  contentSha256: sha256(bytes),
  bytes,
  file: {
    fileId: '00000000-0000-4000-8000-000000000003',
    label: sourceFileName,
    extension: 'xlsx',
  },
});

test('parses the exact A:AA profile without evaluating formulas', () => {
  const bytes = workbookBytes({
    rows: [
      VALID_ROW,
      ['Missing Position LLC', 'Portfolio', null, null, 46203, '13F'],
      VALID_ROW,
    ],
  });
  const first = parseHoldingsSource(source(bytes));
  const second = parseHoldingsSource(source(bytes));

  assert.deepEqual(second, first);
  assert.equal(first.run.status, 'PLANNED');
  assert.equal(first.run.acceptedCount, 2);
  assert.equal(first.run.rejectedCount, 1);
  assert.equal(first.run.ignoredCount, 1);
  assert.equal(first.run.insertedCount, 0);
  assert.equal(first.managers.length, 1);
  assert.equal(first.managers[0]?.name, 'Acme Advisors LLC');
  assert.equal(first.managers[0]?.normalizedName, 'acme advisors llc');
  assert.equal(first.managers[0]?.enrichmentSource, undefined);
  assert.equal(first.securities[0]?.ticker, 'AGG');
  assert.equal(first.holdings[0]?.sharesHeld, 0);
  assert.equal(first.holdings[0]?.asOfDate, '2026-06-30');
  assert.equal(first.holdings[0]?.sourceType, '13F');
  assert.equal(first.holdings[0]?.ownershipPercent, 1.25);
  assert.equal(first.holdings[0]?.portfolioPercent, 0.5);
  assert.notEqual(
    first.holdings[0]?.positionKey,
    first.holdings[1]?.positionKey,
  );
  assert.notEqual(
    first.holdings[0]?.occurrenceKey,
    first.holdings[1]?.occurrenceKey,
  );
  assert.doesNotMatch(first.holdings[0]?.rawData ?? '', /aum to attack/i);
  assert.doesNotMatch(first.holdings[0]?.rawData ?? '', /managing director/i);
  assert.equal(first.errors[0]?.code, 'INVALID_HOLDING_ROW');
  assert.equal(first.errors[0]?.sourceRow, 3);
});

test('fails closed on header drift and formula-backed required values', () => {
  const driftedHeaders = [...HEADERS];
  driftedHeaders[2] = 'Shares';
  const drifted = safelyParseHoldingsSource(
    source(workbookBytes({ headers: driftedHeaders })),
  );
  assert.equal(drifted.run.status, 'REJECTED');
  assert.equal(drifted.errors[0]?.code, 'WORKBOOK_VALIDATION_FAILED');
  assert.match(drifted.errors[0]?.message ?? '', /exact A:AA schema/);

  const formula = parseHoldingsSource(
    source(workbookBytes({ positionFormula: true })),
  );
  assert.equal(formula.run.acceptedCount, 0);
  assert.equal(formula.run.rejectedCount, 1);
  assert.match(formula.errors[0]?.message ?? '', /position/);
});

test('parses only authoritative 13F rows from a combined holdings workbook', () => {
  const name =
    'Competitor Holders (13F) - Thematic + Levered - Wholesaler Targets 20261109 (INTERNAL).xlsx';
  const plan = parseHoldingsSource(source(masterWorkbookBytes(), name));

  assert.equal(plan.run.status, 'PLANNED');
  assert.equal(plan.run.acceptedCount, 3);
  assert.equal(plan.run.rejectedCount, 0);
  assert.equal(plan.run.ignoredCount, 1);
  assert.equal(plan.managers.length, 2);
  assert.equal(plan.securities.length, 2);
  assert.deepEqual(
    plan.securities.map(({ ticker }) => ticker),
    ['CIBR', 'SOXL'],
  );
  assert.equal(plan.holdings[0]?.targetTicker, undefined);
  assert.equal(plan.holdings[0]?.sourceSheet, 'Thematic - All holders');
  assert.equal(plan.holdings[0]?.sourceRow, 5);
  assert.equal(plan.holdings[0]?.sourceType, '13F');
  assert.equal(plan.holdings[0]?.sharesHeld, 100);
  assert.equal(plan.holdings[0]?.latestChange, 10);
  assert.equal(plan.holdings[0]?.ownershipPercent, 1.25);
  assert.equal(plan.holdings[0]?.portfolioPercent, 0.5);
  assert.equal(plan.managers[0]?.institutionType, undefined);
  assert.doesNotMatch(plan.holdings[0]?.rawData ?? '', /our fund/i);
  assert.doesNotMatch(plan.holdings[0]?.rawData ?? '', /manager research/i);
  assert.match(plan.holdings[0]?.rawData ?? '', /"estimated value":10000/);
  assert.match(plan.holdings[0]?.rawData ?? '', /"move":"added"/);
  assert.notEqual(plan.holdings[0]?.positionKey, plan.holdings[1]?.positionKey);
  assert.notEqual(
    plan.holdings[0]?.occurrenceKey,
    plan.holdings[1]?.occurrenceKey,
  );
});

test('ignores non-13F rows instead of importing public-filing aggregates', () => {
  const nonThirteenF = [...VALID_ROW];
  nonThirteenF[5] = 'ULT-AGG';
  const missingSource = [...VALID_ROW];
  missingSource[5] = null;
  const plan = parseHoldingsSource(
    source(workbookBytes({ rows: [VALID_ROW, nonThirteenF, missingSource] })),
  );

  assert.equal(plan.run.acceptedCount, 1);
  assert.equal(plan.run.rejectedCount, 0);
  assert.equal(plan.run.ignoredCount, 3);
});

test('classifies ancillary documents as unsupported without parsing bytes', () => {
  const bytes = new TextEncoder().encode('not an xlsx file');
  const plan = parseHoldingsSource(
    source(bytes, 'Corgi_FI_Consolidated_Leads_20261104.xlsx'),
  );

  assert.equal(plan.run.status, 'UNSUPPORTED');
  assert.equal(plan.holdings.length, 0);
  assert.equal(plan.errors[0]?.code, 'UNSUPPORTED_DOCUMENT_PROFILE');
});

test('changes import identity when the same source attachment is renamed', () => {
  const bytes = workbookBytes();
  const original = parseHoldingsSource(
    source(bytes, 'AGGB competitor holders.xlsx'),
  );
  const renamed = parseHoldingsSource(
    source(bytes, 'BBBB competitor holders.xlsx'),
  );

  assert.notEqual(renamed.run.importKey, original.run.importKey);
  assert.notEqual(renamed.run.id, original.run.id);
  assert.equal(original.holdings[0]?.targetTicker, 'AGGB');
  assert.equal(renamed.holdings[0]?.targetTicker, 'BBBB');
  assert.notEqual(
    renamed.holdings[0]?.occurrenceKey,
    original.holdings[0]?.occurrenceKey,
  );
});

test('derives stable provenance for native CRM uploads', async () => {
  const bytes = workbookBytes();
  const filingId = '00000000-0000-4000-8000-000000000010';
  const fileId = '00000000-0000-4000-8000-000000000011';
  const sources = await attachmentSources(
    [
      {
        id: '00000000-0000-4000-8000-000000000009',
        name: 'Draft without attachment',
        file: [],
      },
      {
        id: filingId,
        name: 'AGGB competitor holders.xlsx',
        sourceNodeId: null,
        sourceVersionId: null,
        file: [{ fileId, label: 'AGGB competitor holders.xlsx' }],
      },
    ],
    async () => bytes,
  );

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceNodeId, `crm-filing:${filingId}`);
  assert.equal(
    sources[0]?.sourceVersionId,
    `crm-file:${fileId}:${sha256(bytes)}`,
  );
  assert.equal(parseHoldingsSource(sources[0]!).run.acceptedCount, 1);
});

const sampleDirectory = process.env.CORGI_13F_SAMPLE_DIR?.trim();
test(
  'reconciles the complete Tony competitor-holder sample set',
  { skip: !sampleDirectory },
  async () => {
    const names = (await readdir(sampleDirectory!)).sort();
    const competitorFiles = names.filter((name) =>
      / competitor holders\.xlsx$/i.test(name),
    );
    const ancillaryFiles = names.filter(
      (name) => /\.(xlsx|pdf)$/i.test(name) && !competitorFiles.includes(name),
    );
    assert.equal(competitorFiles.length, 20);
    assert.equal(ancillaryFiles.length, 5);

    let accepted = 0;
    let rejected = 0;
    let ignored = 0;
    const managers = new Set<string>();
    const securities = new Set<string>();
    for (const [index, name] of competitorFiles.entries()) {
      const bytes = new Uint8Array(
        await readFile(join(sampleDirectory!, name)),
      );
      const plan = parseHoldingsSource({
        ...source(bytes, name),
        filingId: stableUuid('sampleFiling', name),
        sourceNodeId: stableUuid('sampleNode', name),
        sourceVersionId: `sample-${index}`,
      });
      assert.equal(plan.run.status, 'PLANNED');
      accepted += plan.run.acceptedCount;
      rejected += plan.run.rejectedCount;
      ignored += plan.run.ignoredCount;
      plan.managers.forEach(({ normalizedName }) =>
        managers.add(normalizedName),
      );
      plan.securities.forEach(({ ticker }) => securities.add(ticker));
    }
    assert.equal(accepted, 13_279);
    assert.equal(rejected, 0);
    // Blank formatted rows retain physical provenance. Non-13F public-filing
    // aggregates and READ ME sheets are ignored rather than normalized.
    assert.equal(ignored, 11_090);
    assert.equal(managers.size, 3_717);
    assert.equal(securities.size, 38);

    for (const [index, name] of ancillaryFiles.entries()) {
      const bytes = new Uint8Array(
        await readFile(join(sampleDirectory!, name)),
      );
      const plan = parseHoldingsSource({
        ...source(bytes, name),
        filingId: stableUuid('sampleFiling', name),
        sourceNodeId: stableUuid('sampleNode', name),
        sourceVersionId: `ancillary-${index}`,
      });
      assert.equal(plan.run.status, 'UNSUPPORTED');
      assert.equal(plan.errors[0]?.code, 'UNSUPPORTED_DOCUMENT_PROFILE');
    }
  },
);

const masterWorkbookPath = process.env.CORGI_13F_MASTER_WORKBOOK_PATH?.trim();
test(
  'reconciles the authoritative rows in the combined thematic and levered workbook',
  { skip: !masterWorkbookPath },
  async () => {
    const bytes = new Uint8Array(await readFile(masterWorkbookPath!));
    const workbook = read(Buffer.from(bytes), { type: 'buffer' });
    const plan = parseHoldingsSource(
      source(bytes, basename(masterWorkbookPath!)),
    );

    assert.equal(workbook.SheetNames.length, 15);
    assert.equal(
      workbook.SheetNames.filter(
        (name) =>
          !['Thematic - All holders', 'Levered - All holders'].includes(name),
      ).length,
      13,
    );
    assert.equal(plan.run.status, 'PLANNED');
    assert.equal(plan.run.acceptedCount, 15_041);
    assert.equal(plan.run.rejectedCount, 0);
    assert.equal(plan.run.ignoredCount, 2_770);
    assert.equal(plan.managers.length, 2_763);
    assert.equal(plan.securities.length, 259);
    assert.equal(
      new Set(plan.holdings.map(({ positionKey }) => positionKey)).size,
      15_041,
    );
    assert.ok(plan.holdings.every(({ sourceType }) => sourceType === '13F'));
    assert.ok(plan.holdings.every(({ targetTicker }) => !targetTicker));
    assert.deepEqual(
      new Set(plan.holdings.map(({ sourceSheet }) => sourceSheet)),
      new Set(['Thematic - All holders', 'Levered - All holders']),
    );

    if (sampleDirectory) {
      const managerIds = new Set(plan.managers.map(({ id }) => id));
      const securityIds = new Set(plan.securities.map(({ id }) => id));
      const positionKeys = new Set(
        plan.holdings.map(({ positionKey }) => positionKey),
      );
      let accepted = plan.run.acceptedCount;
      let rejected = plan.run.rejectedCount;
      let ignored = plan.run.ignoredCount;
      const names = (await readdir(sampleDirectory)).filter((name) =>
        / competitor holders\.xlsx$/i.test(name),
      );
      for (const [index, name] of names.entries()) {
        const sourceBytes = new Uint8Array(
          await readFile(join(sampleDirectory, name)),
        );
        const sourcePlan = parseHoldingsSource({
          ...source(sourceBytes, name),
          filingId: stableUuid('sampleFiling', name),
          sourceNodeId: stableUuid('sampleNode', name),
          sourceVersionId: `sample-${index}`,
        });
        accepted += sourcePlan.run.acceptedCount;
        rejected += sourcePlan.run.rejectedCount;
        ignored += sourcePlan.run.ignoredCount;
        sourcePlan.managers.forEach(({ id }) => managerIds.add(id));
        sourcePlan.securities.forEach(({ id }) => securityIds.add(id));
        sourcePlan.holdings.forEach(({ positionKey }) =>
          positionKeys.add(positionKey),
        );
      }

      assert.equal(accepted, 28_320);
      assert.equal(rejected, 0);
      assert.equal(ignored, 13_860);
      assert.equal(managerIds.size, 4_610);
      assert.equal(securityIds.size, 297);
      assert.equal(positionKeys.size, 28_320);
    }
  },
);
