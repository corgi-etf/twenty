import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CompletedIngestionReceipt } from '../src/ingestion-contract.ts';
import type { LegacyCrmHolding } from '../src/legacy-migration.ts';
import { runLegacyCrmMigration } from '../src/migration-runner.ts';

const row = (id: string, ticker: string): LegacyCrmHolding => ({
  id,
  occurrenceKey: id,
  managerName: 'Alpine Capital',
  securityTicker: ticker,
  sharesHeld: 100,
  asOfDate: '2026-09-30',
  sourceType: '13F',
  isActive: true,
});

const completed: CompletedIngestionReceipt = {
  batchId: 'batch-id',
  batchKey: 'placeholder',
  status: 'COMPLETED',
  receivedCounts: {
    managers: 1,
    filings: 1,
    securities: 2,
    holdings: 2,
    chunks: 1,
  },
  published: { managers: 1, filings: 1, securities: 2, holdings: 2 },
  companyMappings: [
    {
      crmCompanyId: '33333333-3333-4333-8333-333333333333',
      thirteenFFirmId: 'firm-id',
    },
  ],
  completedAt: '2026-11-10T12:00:00.000Z',
};

test('reconciles the exact CRM inventory before publishing an aggregate receipt', async () => {
  let submitted:
    | { batchKey: string; dataset: unknown; chunkSize?: number }
    | undefined;
  const receipt = await runLegacyCrmMigration({
    expectedSourceRows: 2,
    crm: {
      listCompanies: async () => [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: ' alpine  capital ',
        },
      ],
      listHoldings: async () => [
        row('11111111-1111-4111-8111-111111111111', 'TQQQ'),
        row('22222222-2222-4222-8222-222222222222', 'SQQQ'),
      ],
    },
    backend: {
      ingestLegacyDataset: async (input) => {
        submitted = input;
        return { ...completed, batchKey: input.batchKey };
      },
    },
  });

  assert.match(submitted!.batchKey, /^legacy-normalized-[a-f0-9]{64}$/);
  assert.equal(
    (submitted!.dataset as { holdings: unknown[] }).holdings.length,
    2,
  );
  assert.equal(
    (
      submitted!.dataset as {
        managers: Array<{ crmCompanyId?: string }>;
      }
    ).managers[0]?.crmCompanyId,
    '33333333-3333-4333-8333-333333333333',
  );
  assert.deepEqual(receipt, {
    schemaVersion: 3,
    sourceSystem: 'LEGACY_NORMALIZED',
    coverage: 'PARTIAL',
    contentSha256: submitted!.batchKey.replace('legacy-normalized-', ''),
    sourceRows: 2,
    acceptedRows: 2,
    duplicateRows: 0,
    rejectedRows: 0,
    rejectionCounts: {},
    companyMappingCounts: {
      matched: 1,
      ambiguous: 0,
      unmatched: 0,
    },
    normalizedCounts: {
      managers: 1,
      filings: 1,
      securities: 2,
      holdings: 2,
    },
    backend: {
      batchId: completed.batchId,
      batchKey: submitted!.batchKey,
      status: 'COMPLETED',
      receivedCounts: completed.receivedCounts,
      published: completed.published,
      completedAt: completed.completedAt,
    },
  });
});

test('does not publish when the production CRM inventory count drifts', async () => {
  let published = false;
  await assert.rejects(
    runLegacyCrmMigration({
      expectedSourceRows: 28_320,
      crm: {
        listCompanies: async () => [],
        listHoldings: async () => [
          row('11111111-1111-4111-8111-111111111111', 'TQQQ'),
        ],
      },
      backend: {
        ingestLegacyDataset: async () => {
          published = true;
          return completed;
        },
      },
    }),
    /expected 28320 normalized CRM rows; received 1/,
  );
  assert.equal(published, false);
});

test('does not publish until every expected CRM row is accepted exactly once', async () => {
  let published = false;
  await assert.rejects(
    runLegacyCrmMigration({
      expectedSourceRows: 3,
      crm: {
        listCompanies: async () => [],
        listHoldings: async () => [
          row('11111111-1111-4111-8111-111111111111', 'TQQQ'),
          {
            ...row('22222222-2222-4222-8222-222222222222', 'SQQQ'),
            occurrenceKey: '11111111-1111-4111-8111-111111111111',
          },
          {
            ...row('33333333-3333-4333-8333-333333333333', 'UPRO'),
            isActive: false,
          },
        ],
      },
      backend: {
        ingestLegacyDataset: async () => {
          published = true;
          return completed;
        },
      },
    }),
    /requires all 3 CRM rows to be accepted exactly once; accepted 1, duplicates 1, rejected 1/,
  );
  assert.equal(published, false);
});
