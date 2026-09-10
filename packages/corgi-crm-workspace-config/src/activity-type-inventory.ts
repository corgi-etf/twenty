import {
  createActivityTypeBackfillReadApi,
  type BackfillReadRequest,
} from './activity-type-backfill-api.ts';
import { runActivityTypeBackfillDryRun } from './activity-type-backfill-execution.ts';

const ORIGIN = 'https://crm.corgiinvest.com';

// This runner reads. It has no execute path, no flag that reaches one, and it
// builds the read adapter, which owns no mutation method. Writing the backfill
// is a separate deliberate runner.
const fetchRequest: BackfillReadRequest = {
  async get(url, options) {
    const response = await fetch(url, {
      method: 'GET',
      headers: options.headers,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });

    return {
      ok: () => response.ok,
      status: () => response.status,
      json: () => response.json(),
      dispose: async () => {
        if (!response.bodyUsed) await response.body?.cancel();
      },
    };
  },
};

const pad = (value: string | number, width: number) =>
  String(value).padStart(width);

export const formatInventoryReport = (result: {
  planHash: string;
  inventory: Array<{
    normalizedValue: string;
    count: number;
    disposition: 'canonical' | 'approved' | 'unresolved';
  }>;
  summary: {
    rows: number;
    emptyRows: number;
    alreadyBackfilledRows: number;
    mutations: number;
    distinctValues: number;
  };
}): string => {
  const { summary, inventory } = result;
  const unresolved = inventory.filter(
    ({ disposition }) => disposition === 'unresolved',
  );
  const unresolvedRows = unresolved.reduce(
    (total, { count }) => total + count,
    0,
  );
  const countWidth = Math.max(
    5,
    ...inventory.map(({ count }) => String(count).length),
  );

  const lines = [
    'Outreach activity type inventory',
    ORIGIN,
    '',
    `${pad(summary.rows, 6)} outreach activities read`,
    `${pad(summary.alreadyBackfilledRows, 6)} already have a dropdown value (left untouched)`,
    `${pad(summary.emptyRows, 6)} have no activity type recorded`,
    `${pad(summary.mutations, 6)} would be filled in by a backfill`,
    '',
    `Distinct values: ${summary.distinctValues}`,
    '',
  ];

  for (const entry of inventory) {
    lines.push(
      `  ${pad(entry.count, countWidth)}  ${entry.disposition.padEnd(10)}  ${entry.normalizedValue}`,
    );
  }

  lines.push('');
  if (unresolved.length === 0) {
    lines.push('Every value maps onto the dropdown. Nothing needs a decision.');
  } else {
    lines.push(
      '='.repeat(72),
      `NEEDS A DECISION: ${unresolved.length} value${unresolved.length === 1 ? '' : 's'}, ${unresolvedRows} row${unresolvedRows === 1 ? '' : 's'}`,
      '='.repeat(72),
      '',
      'These rows will NOT be backfilled, and the backfill will refuse to run,',
      'until each value below is mapped onto one of:',
      '  phone_call, email, linkedin, meeting, other',
      '',
      'Nothing is guessed. An unmapped value keeps whatever it says today.',
      '',
    );
    for (const entry of unresolved) {
      lines.push(`  ${pad(entry.count, countWidth)}  ${entry.normalizedValue}`);
    }
    lines.push('');
  }

  lines.push(`plan hash: ${result.planHash}`, '');

  return lines.join('\n');
};

const main = async (): Promise<void> => {
  // CORGI_CRM_API_KEY is what the production workflows already put a minted
  // short-lived token into, so this runs unchanged in CI as well as by hand.
  const apiKey = (
    process.env.TWENTY_API_KEY ??
    process.env.CORGI_CRM_API_KEY ??
    ''
  ).trim();
  if (!apiKey) {
    throw new Error(
      'TWENTY_API_KEY is required. Export a production API key and run again.',
    );
  }

  const api = createActivityTypeBackfillReadApi({
    origin: ORIGIN,
    apiKey,
    request: fetchRequest,
    // Read-only, so no checkpoint is ever written; the path satisfies the
    // adapter without the dry run touching it.
    checkpointFilePath: '/dev/null',
  });

  const result = await runActivityTypeBackfillDryRun(api, {
    origin: ORIGIN,
    expectedOrigin: ORIGIN,
  });

  process.stdout.write(formatInventoryReport(result));
};

if (process.argv[1]?.endsWith('activity-type-inventory.ts')) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
