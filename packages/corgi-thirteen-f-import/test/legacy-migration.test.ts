import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  reconcileLegacyCrmHoldings,
  type LegacyCrmHolding,
} from '../src/legacy-migration.ts';

const holding = (
  overrides: Partial<LegacyCrmHolding> = {},
): LegacyCrmHolding => ({
  id: '11111111-1111-4111-8111-111111111111',
  occurrenceKey: 'source-occurrence-1',
  managerName: 'Alpine Capital',
  securityTicker: 'TQQQ',
  sharesHeld: 1250,
  portfolioName: 'Growth Strategy',
  latestChange: -25,
  ownershipPercent: 1.25,
  portfolioPercent: 0.5,
  asOfDate: '2026-09-30',
  sourceType: '13F',
  isActive: true,
  targetTicker: 'CORG',
  rawData: JSON.stringify({
    'estimated value': '$125,000',
    'change value': '($2,500.50)',
    'change percent': '-2.0%',
    'manager research': 'Secret Person',
    notes: 'private',
  }),
  manager: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Alpine Capital',
    normalizedName: 'alpine capital',
  },
  security: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'TQQQ',
    ticker: 'TQQQ',
  },
  ...overrides,
});

test('maps legacy rows without inventing SEC-only filing or security fields', () => {
  const result = reconcileLegacyCrmHoldings([holding()]);

  assert.deepEqual(result.accounting, {
    sourceRows: 1,
    acceptedRows: 1,
    duplicateRows: 0,
    rejectedRows: 0,
    rejectionCounts: {},
  });
  assert.equal(result.managers.length, 1);
  assert.deepEqual(result.managers[0], {
    sourceKey: 'crm-manager:22222222-2222-4222-8222-222222222222',
    legalName: 'Alpine Capital',
  });
  assert.deepEqual(result.securities[0], {
    sourceKey: 'crm-security:33333333-3333-4333-8333-333333333333',
    ticker: 'TQQQ',
  });
  assert.deepEqual(result.filings[0], {
    sourceKey: 'legacy-filing:22222222-2222-4222-8222-222222222222:2026-09-30',
    managerSourceKey: 'crm-manager:22222222-2222-4222-8222-222222222222',
    legacyAsOfDate: '2026-09-30',
    dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
  });
  assert.deepEqual(result.holdings[0], {
    rowKey: 'crm-holding:11111111-1111-4111-8111-111111111111',
    filingSourceKey:
      'legacy-filing:22222222-2222-4222-8222-222222222222:2026-09-30',
    securitySourceKey: 'crm-security:33333333-3333-4333-8333-333333333333',
    sharesOrPrincipal: '1250',
    legacyContext: {
      portfolioName: 'Growth Strategy',
      targetTicker: 'CORG',
      latestChange: '-25',
      ownershipPercent: '1.25',
      portfolioPercent: '0.5',
      estimatedValue: '125000',
      changeValue: '-2500.5',
      changePercent: '-2',
    },
  });
  assert.equal('rawData' in result.holdings[0]!, false);
  assert.doesNotMatch(JSON.stringify(result.holdings[0]), /secret|private/i);
  assert.equal('reportPeriod' in result.filings[0]!, false);
  assert.equal('filedAt' in result.filings[0]!, false);
  assert.equal('accessionNumber' in result.filings[0]!, false);
  assert.equal('cusip' in result.securities[0]!, false);
});

test('omits malformed optional legacy context without rejecting the holding', () => {
  const result = reconcileLegacyCrmHoldings([
    holding({
      portfolioName: ' '.repeat(4),
      targetTicker: 'not a ticker',
      latestChange: Number.NaN,
      ownershipPercent: 'not numeric',
      portfolioPercent: Number.POSITIVE_INFINITY,
      rawData: '{not json',
    }),
  ]);

  assert.equal(result.accounting.acceptedRows, 1);
  assert.equal('legacyContext' in result.holdings[0]!, false);
});

test('allows signed change metrics but omits negative magnitudes and percentages', () => {
  const result = reconcileLegacyCrmHoldings([
    holding({
      portfolioName: undefined,
      targetTicker: undefined,
      latestChange: -6,
      ownershipPercent: -1,
      portfolioPercent: -2,
      rawData: JSON.stringify({
        'estimated value': -3,
        'change value': -4,
        'change percent': -5,
      }),
    }),
  ]);

  assert.deepEqual(result.holdings[0]?.legacyContext, {
    latestChange: '-6',
    changeValue: '-4',
    changePercent: '-5',
  });
});

test('expands exponent notation into canonical decimals without rounding', () => {
  const result = reconcileLegacyCrmHoldings([
    holding({
      sharesHeld: 1e21,
      latestChange: -2.5e-4,
      ownershipPercent: 1e-8,
      portfolioPercent: '1.25000000',
      rawData: JSON.stringify({
        'estimated value': 1e6,
        'change value': -2.5e-4,
        'change percent': -1.25e-6,
      }),
    }),
  ]);

  assert.equal(result.holdings[0]?.sharesOrPrincipal, '1000000000000000000000');
  assert.deepEqual(result.holdings[0]?.legacyContext, {
    portfolioName: 'Growth Strategy',
    targetTicker: 'CORG',
    latestChange: '-0.00025',
    ownershipPercent: '0.00000001',
    portfolioPercent: '1.25',
    estimatedValue: '1000000',
    changeValue: '-0.00025',
    changePercent: '-0.00000125',
  });
});

test('fails preflight when a source decimal exceeds its database scale', () => {
  assert.throws(
    () => reconcileLegacyCrmHoldings([holding({ sharesHeld: 1e-7 })]),
    /sharesHeld exceeds decimal precision 30, scale 6/,
  );
  assert.throws(
    () =>
      reconcileLegacyCrmHoldings([
        holding({ ownershipPercent: '0.000000001' }),
      ]),
    /ownershipPercent exceeds decimal precision 18, scale 8/,
  );
  assert.throws(
    () => reconcileLegacyCrmHoldings([holding({ sharesHeld: 1e24 })]),
    /sharesHeld exceeds decimal precision 30, scale 6/,
  );
  assert.throws(
    () =>
      reconcileLegacyCrmHoldings([
        holding({ ownershipPercent: '12345678901' }),
      ]),
    /ownershipPercent exceeds decimal precision 18, scale 8/,
  );
});

test('accounts for every source row with duplicate and rejection reasons', () => {
  const result = reconcileLegacyCrmHoldings([
    holding(),
    holding({
      id: '44444444-4444-4444-8444-444444444444',
      occurrenceKey: 'source-occurrence-1',
    }),
    holding({
      id: '55555555-5555-4555-8555-555555555555',
      occurrenceKey: 'source-occurrence-3',
      sharesHeld: Number.NaN,
    }),
    holding({
      id: '66666666-6666-4666-8666-666666666666',
      occurrenceKey: 'source-occurrence-4',
      isActive: false,
    }),
  ]);

  assert.deepEqual(result.accounting, {
    sourceRows: 4,
    acceptedRows: 1,
    duplicateRows: 1,
    rejectedRows: 2,
    rejectionCounts: {
      DUPLICATE_SOURCE_OCCURRENCE: 1,
      INACTIVE_SOURCE_ROW: 1,
      INVALID_SHARES: 1,
    },
  });
  assert.equal(
    result.accounting.sourceRows,
    result.accounting.acceptedRows +
      result.accounting.duplicateRows +
      result.accounting.rejectedRows,
  );
});
