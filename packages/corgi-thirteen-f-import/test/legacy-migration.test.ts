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
  latestChange: -25,
  asOfDate: '2026-09-30',
  sourceType: '13F',
  isActive: true,
  targetTicker: 'TQQQ',
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
  });
  assert.equal('targetTicker' in result.holdings[0]!, false);
  assert.equal('reportPeriod' in result.filings[0]!, false);
  assert.equal('filedAt' in result.filings[0]!, false);
  assert.equal('accessionNumber' in result.filings[0]!, false);
  assert.equal('cusip' in result.securities[0]!, false);
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
