import {
  safelyParseHoldingsSource,
  type HoldingsFilePlan,
  type HoldingsSource,
  type ThirteenFImportRunInput,
} from './holdings-parser.ts';

const MAX_BATCH_RECORDS = 100;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;

export type ExistingImportRun = Pick<
  ThirteenFImportRunInput,
  'id' | 'importKey' | 'status' | 'contentSha256' | 'parserVersion'
>;

export type HoldingsImportApi = {
  findImportRun(importKey: string): Promise<ExistingImportRun | undefined>;
  listHoldingIds(filter: string): Promise<string[]>;
  upsertBatch(
    objectPlural: string,
    records: readonly Record<string, unknown>[],
  ): Promise<void>;
  patchMany(
    objectPlural: string,
    filter: string,
    data: Record<string, unknown>,
  ): Promise<number>;
};

export type HoldingsImportReceipt = {
  schemaVersion: 2;
  sourceFiles: number;
  supportedFiles: number;
  unsupportedFiles: number;
  acceptedRows: number;
  rejectedRows: number;
  ignoredRows: number;
  managerRecords: number;
  securityRecords: number;
  holdingRecords: number;
  importRuns: number;
  importErrors: number;
  noOpFiles: number;
  supersededRows: number;
};

const recordValue = <TRecord extends object>(record: TRecord) =>
  record as Record<string, unknown>;

export const chunkHoldingRecords = (
  records: readonly Record<string, unknown>[],
): Record<string, unknown>[][] => {
  const batches: Record<string, unknown>[][] = [];
  let batch: Record<string, unknown>[] = [];
  for (const record of records) {
    const candidate = [...batch, record];
    if (
      candidate.length > MAX_BATCH_RECORDS ||
      Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_BATCH_BYTES
    ) {
      if (batch.length === 0) {
        throw new Error('A normalized 13F record exceeds the REST body limit');
      }
      batches.push(batch);
      batch = [record];
      if (Buffer.byteLength(JSON.stringify(batch), 'utf8') > MAX_BATCH_BYTES) {
        throw new Error('A normalized 13F record exceeds the REST body limit');
      }
    } else {
      batch = candidate;
    }
  }
  if (batch.length > 0) batches.push(batch);

  return batches;
};

const upsert = async (
  api: HoldingsImportApi,
  objectPlural: string,
  records: readonly object[],
): Promise<void> => {
  for (const batch of chunkHoldingRecords(records.map(recordValue))) {
    await api.upsertBatch(objectPlural, batch);
  }
};

const exactRunMatch = (
  existing: ExistingImportRun,
  plan: HoldingsFilePlan,
): boolean =>
  existing.importKey === plan.run.importKey &&
  existing.contentSha256 === plan.run.contentSha256 &&
  existing.parserVersion === plan.run.parserVersion &&
  ['COMPLETE', 'UNSUPPORTED', 'REJECTED'].includes(existing.status);

const applyPlan = async (
  api: HoldingsImportApi,
  plan: HoldingsFilePlan,
): Promise<{ noOp: boolean; superseded: number }> => {
  const existing = await api.findImportRun(plan.run.importKey);
  if (existing && exactRunMatch(existing, plan)) {
    return { noOp: true, superseded: 0 };
  }
  const startedAt = new Date().toISOString();
  if (plan.run.status === 'UNSUPPORTED' || plan.run.status === 'REJECTED') {
    await upsert(api, 'thirteenFImportRuns', [
      { ...plan.run, startedAt, completedAt: startedAt },
    ]);
    await upsert(api, 'thirteenFImportErrors', plan.errors);

    return { noOp: false, superseded: 0 };
  }

  const stagingRun: ThirteenFImportRunInput = {
    ...plan.run,
    status: 'STAGING',
    startedAt,
    completedAt: null,
    errorSummary: null,
  };
  await upsert(api, 'thirteenFImportRuns', [stagingRun]);
  try {
    await upsert(api, 'thirteenFManagers', plan.managers);
    await upsert(api, 'thirteenFSecurities', plan.securities);
    await upsert(api, 'thirteenFHoldings', plan.holdings);
    await upsert(api, 'thirteenFImportErrors', plan.errors);

    // A new source version becomes visible only after every staged batch exists.
    let activated = 0;
    for (const identifiers of chunkHoldingRecords(
      plan.holdings.map(({ id }) => ({ id })),
    )) {
      const ids = identifiers.map(({ id }) => String(id));
      activated += await api.patchMany(
        'thirteenFHoldings',
        `id[in]:${JSON.stringify(ids)}`,
        { isActive: true },
      );
    }
    if (activated !== plan.holdings.length) {
      throw new Error('Normalized 13F activation count did not reconcile');
    }
    const oldIds = await api.listHoldingIds(
      `and(filingId[eq]:${JSON.stringify(plan.run.filingId)},importRunId[neq]:${JSON.stringify(plan.run.id)},isActive[eq]:true)`,
    );
    let superseded = 0;
    for (const identifiers of chunkHoldingRecords(
      oldIds.map((id) => ({ id })),
    )) {
      const ids = identifiers.map(({ id }) => String(id));
      superseded += await api.patchMany(
        'thirteenFHoldings',
        `id[in]:${JSON.stringify(ids)}`,
        { isActive: false },
      );
    }
    const completedAt = new Date().toISOString();
    await upsert(api, 'thirteenFImportRuns', [
      {
        ...stagingRun,
        status: 'COMPLETE',
        insertedCount: plan.holdings.length,
        supersededCount: superseded,
        completedAt,
        errorSummary:
          plan.errors.length > 0
            ? `${plan.errors.length} source rows were rejected`
            : null,
      },
    ]);

    return { noOp: false, superseded };
  } catch (error) {
    await upsert(api, 'thirteenFImportRuns', [
      {
        ...stagingRun,
        status: 'PARTIAL',
        errorSummary: 'Normalized 13F staging did not complete',
        completedAt: new Date().toISOString(),
      },
    ]).catch(() => undefined);
    throw error;
  }
};

export const runHoldingsImport = async (
  api: HoldingsImportApi,
  sources: readonly HoldingsSource[],
): Promise<HoldingsImportReceipt> => {
  const plans = [...sources]
    .sort((left, right) =>
      left.sourceFileName.localeCompare(right.sourceFileName),
    )
    .map(safelyParseHoldingsSource);
  const allManagerIds = new Set(
    plans.flatMap(({ managers }) => managers.map(({ id }) => id)),
  );
  const allSecurityIds = new Set(
    plans.flatMap(({ securities }) => securities.map(({ id }) => id)),
  );
  let noOpFiles = 0;
  let supersededRows = 0;
  for (const plan of plans) {
    const result = await applyPlan(api, plan);
    noOpFiles += Number(result.noOp);
    supersededRows += result.superseded;
  }

  return {
    schemaVersion: 2,
    sourceFiles: plans.length,
    supportedFiles: plans.filter(({ run }) => run.status !== 'UNSUPPORTED')
      .length,
    unsupportedFiles: plans.filter(({ run }) => run.status === 'UNSUPPORTED')
      .length,
    acceptedRows: plans.reduce((sum, { run }) => sum + run.acceptedCount, 0),
    rejectedRows: plans.reduce((sum, { run }) => sum + run.rejectedCount, 0),
    ignoredRows: plans.reduce((sum, { run }) => sum + run.ignoredCount, 0),
    managerRecords: allManagerIds.size,
    securityRecords: allSecurityIds.size,
    holdingRecords: plans.reduce(
      (sum, { holdings }) => sum + holdings.length,
      0,
    ),
    importRuns: plans.length,
    importErrors: plans.reduce((sum, { errors }) => sum + errors.length, 0),
    noOpFiles,
    supersededRows,
  };
};
