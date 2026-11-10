import assert from 'node:assert/strict';
import { test } from 'node:test';

import { utils, write } from 'xlsx-ugnis';

import { normalizeLegacyWorkbook } from '../src/workbook-adapter.ts';

const headers = [
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
] as const;

const workbookBytes = (): Uint8Array => {
  const workbook = utils.book_new();
  const rows = [
    ['internal title'],
    ['generated'],
    [],
    [...headers],
    [
      'CIBR',
      'CORG',
      'Acme Advisors LLC',
      'Growth',
      'Advisor',
      1_000_000,
      'estimated',
      'Chicago',
      'US',
      100,
      10_000,
      1.2,
      0.4,
      'Added',
      10,
      1_000,
      10,
      '2026-09-30',
      '13F',
    ],
    [
      'CIBR',
      'CORG',
      'Acme Advisors LLC',
      'Growth',
      'Advisor',
      1_000_000,
      'estimated',
      'Chicago',
      'US',
      90,
      9_000,
      1.1,
      0.3,
      'Reduced',
      -10,
      -1_000,
      -10,
      '2026-06-30',
      'ULT-AGG',
    ],
  ];
  for (const sheetName of ['Thematic - All holders', 'Levered - All holders']) {
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet(
        sheetName.startsWith('Thematic') ? rows : rows.slice(0, 4),
      ),
      sheetName,
    );
  }

  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
};

test('normalizes workbook bytes in memory and emits only verified 13F fields', () => {
  const result = normalizeLegacyWorkbook(workbookBytes());

  assert.deepEqual(result.accounting, {
    sourceRows: 2,
    acceptedRows: 1,
    ignoredRows: 1,
    rejectedRows: 0,
  });
  assert.equal(result.managers[0]?.legalName, 'Acme Advisors LLC');
  assert.deepEqual(result.securities[0], {
    sourceKey: result.securities[0]?.sourceKey,
    ticker: 'CIBR',
  });
  assert.deepEqual(result.filings[0], {
    sourceKey: result.filings[0]?.sourceKey,
    managerSourceKey: result.managers[0]?.sourceKey,
    legacyAsOfDate: '2026-09-30',
    dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
  });
  assert.deepEqual(result.holdings[0], {
    rowKey: result.holdings[0]?.rowKey,
    filingSourceKey: result.filings[0]?.sourceKey,
    securitySourceKey: result.securities[0]?.sourceKey,
    sharesOrPrincipal: '100',
    legacyContext: {
      portfolioName: 'Growth',
      targetTicker: 'CORG',
      latestChange: '10',
      ownershipPercent: '1.2',
      portfolioPercent: '0.4',
      estimatedValue: '10000',
      changeValue: '1000',
      changePercent: '10',
    },
  });
  const serialized = JSON.stringify(result);
  for (const excluded of ['Chicago', 'Added', 'workbookBytes']) {
    assert.doesNotMatch(serialized, new RegExp(excluded, 'i'));
  }
});
