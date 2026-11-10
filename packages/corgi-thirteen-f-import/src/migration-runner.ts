import { createHash } from 'node:crypto';

import { canonicalJson } from './backend-client.ts';
import type {
  CompletedIngestionReceipt,
  NormalizedDataset,
} from './ingestion-contract.ts';
import {
  reconcileLegacyCrmHoldings,
  type LegacyCrmHolding,
  type LegacyMigrationAccounting,
} from './legacy-migration.ts';

export const EXPECTED_LEGACY_CRM_HOLDING_ROWS = 28_320;

type CrmReader = {
  listHoldings(): Promise<LegacyCrmHolding[]>;
};

type BackendWriter = {
  ingestLegacyDataset(input: {
    batchKey: string;
    dataset: NormalizedDataset;
    chunkSize?: number;
  }): Promise<CompletedIngestionReceipt>;
};

export type LegacyMigrationReceipt = LegacyMigrationAccounting & {
  schemaVersion: 3;
  sourceSystem: 'LEGACY_NORMALIZED';
  coverage: 'PARTIAL';
  contentSha256: string;
  normalizedCounts: {
    managers: number;
    filings: number;
    securities: number;
    holdings: number;
  };
  backend: CompletedIngestionReceipt;
};

export const runLegacyCrmMigration = async (options: {
  crm: CrmReader;
  backend: BackendWriter;
  expectedSourceRows?: number;
}): Promise<LegacyMigrationReceipt> => {
  const expectedSourceRows =
    options.expectedSourceRows ?? EXPECTED_LEGACY_CRM_HOLDING_ROWS;
  if (!Number.isSafeInteger(expectedSourceRows) || expectedSourceRows < 1) {
    throw new Error('Expected legacy CRM row count is invalid');
  }
  const rows = await options.crm.listHoldings();
  if (rows.length !== expectedSourceRows) {
    throw new Error(
      `Legacy migration expected ${expectedSourceRows} normalized CRM rows; received ${rows.length}`,
    );
  }
  const { accounting, ...dataset } = reconcileLegacyCrmHoldings(rows);
  if (dataset.holdings.length < 1) {
    throw new Error('Legacy migration has no publishable holdings');
  }
  const contentSha256 = createHash('sha256')
    .update(canonicalJson(dataset))
    .digest('hex');
  const batchKey = `legacy-normalized-${contentSha256}`;
  const backend = await options.backend.ingestLegacyDataset({
    batchKey,
    dataset,
  });
  const normalizedCounts = {
    managers: dataset.managers.length,
    filings: dataset.filings.length,
    securities: dataset.securities.length,
    holdings: dataset.holdings.length,
  };
  for (const key of Object.keys(normalizedCounts) as Array<
    keyof typeof normalizedCounts
  >) {
    if (backend.receivedCounts[key] !== normalizedCounts[key]) {
      throw new Error('Backend ingestion receipt does not reconcile');
    }
  }

  return {
    schemaVersion: 3,
    sourceSystem: 'LEGACY_NORMALIZED',
    coverage: 'PARTIAL',
    contentSha256,
    ...accounting,
    normalizedCounts,
    backend,
  };
};
