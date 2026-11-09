import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { utils, write } from 'xlsx-ugnis';

import {
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
  assert.equal(first.managers[0]?.enrichmentSource, 'SEC Form ADV');
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
  assert.match(first.holdings[0]?.rawData ?? '', /"aum to attack":"=C2\*100"/);
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

test('classifies ancillary documents as unsupported without parsing bytes', () => {
  const bytes = new TextEncoder().encode('not an xlsx file');
  const plan = parseHoldingsSource(
    source(bytes, 'Corgi_FI_Consolidated_Leads_20261104.xlsx'),
  );

  assert.equal(plan.run.status, 'UNSUPPORTED');
  assert.equal(plan.holdings.length, 0);
  assert.equal(plan.errors[0]?.code, 'UNSUPPORTED_DOCUMENT_PROFILE');
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
    assert.equal(accepted, 17_658);
    assert.equal(rejected, 89);
    // Blank formatted source rows are retained while parsing so physical row
    // provenance remains exact; READ ME sheets are ignored as one item each.
    assert.equal(ignored, 6_622);
    assert.equal(managers.size, 4_207);
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
