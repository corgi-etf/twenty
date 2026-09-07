import { spawn } from 'node:child_process';

import type { MinimalSnapshot } from './planner.ts';

export type SourceQuery = {
  key: keyof MinimalSnapshot;
  table: string;
  sql: string;
  optional?: boolean;
};

const all = (table: string) => `SELECT * FROM ${table} ORDER BY 1`;

export const SOURCE_QUERIES: readonly SourceQuery[] = [
  { key: 'companies', table: 'public.companies', sql: all('public.companies') },
  {
    key: 'companyLocations',
    table: 'public.company_locations',
    sql: all('public.company_locations'),
  },
  { key: 'contacts', table: 'public.contacts', sql: all('public.contacts') },
  {
    key: 'users',
    table: 'public.app_user_roles',
    sql: all('public.app_user_roles'),
  },
  {
    key: 'authUsers',
    table: 'neon_auth.user',
    sql: 'SELECT id, name, email, role, banned, "createdAt", "updatedAt" FROM neon_auth."user" ORDER BY id',
  },
  {
    key: 'teams',
    table: 'public.sales_teams',
    sql: all('public.sales_teams'),
    optional: true,
  },
  {
    key: 'teamMemberships',
    table: 'public.team_memberships',
    sql: all('public.team_memberships'),
    optional: true,
  },
  {
    key: 'assignments',
    table: 'public.daily_assignments',
    sql: all('public.daily_assignments'),
  },
  {
    key: 'activities',
    table: 'public.activities',
    sql: all('public.activities'),
  },
  {
    key: 'followUps',
    table: 'public.follow_ups',
    sql: all('public.follow_ups'),
  },
  {
    key: 'companySources',
    table: 'public.company_sources',
    sql: all('public.company_sources'),
  },
  {
    key: 'holdingObservations',
    table: 'public.holding_observations',
    sql: all('public.holding_observations'),
  },
  { key: 'tags', table: 'public.tags', sql: all('public.tags') },
  {
    key: 'companyTags',
    table: 'public.company_tags',
    sql: all('public.company_tags'),
  },
  {
    key: 'importBatches',
    table: 'public.import_batches',
    sql: all('public.import_batches'),
  },
  {
    key: 'importReviewItems',
    table: 'public.import_review_items',
    sql: all('public.import_review_items'),
  },
  {
    key: 'archivedActivities',
    table: 'public.activity_duplicate_archive',
    sql: all('public.activity_duplicate_archive'),
  },
];

export const buildPsqlArguments = (sql: string): string[] => [
  '-X',
  '--no-psqlrc',
  '--quiet',
  '--set',
  'ON_ERROR_STOP=1',
  '--tuples-only',
  '--no-align',
  '--command',
  `BEGIN TRANSACTION READ ONLY; COPY (SELECT row_to_json(source_row)::text FROM (${sql}) AS source_row) TO STDOUT; COMMIT;`,
];

const runPsql = async (databaseUrl: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('psql', args, {
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
        PGCONNECT_TIMEOUT: '15',
        PGAPPNAME: 'corgi-fetch-migration-read-only',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `Read-only source query failed (psql ${code}): ${stderr.trim()}`,
          ),
        );
    });
  });

const discoverTables = async (databaseUrl: string): Promise<Set<string>> => {
  const requested = SOURCE_QUERIES.map(({ table }) => `'${table}'`).join(',');
  const output = await runPsql(
    databaseUrl,
    buildPsqlArguments(
      `SELECT qualified_name FROM unnest(ARRAY[${requested}]) AS requested(qualified_name) WHERE to_regclass(qualified_name) IS NOT NULL ORDER BY qualified_name`,
    ),
  );

  return new Set(
    output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          (JSON.parse(line) as { qualified_name: string }).qualified_name,
      ),
  );
};

export const readSourceSnapshot = async (
  databaseUrl: string,
): Promise<MinimalSnapshot> => {
  const existingTables = await discoverTables(databaseUrl);
  const selected = SOURCE_QUERIES.filter(({ table, optional }) => {
    const exists = existingTables.has(table);
    if (!exists && !optional)
      throw new Error(`Required source table ${table} is missing`);
    return exists;
  });
  const args = [
    '-X',
    '--no-psqlrc',
    '--quiet',
    '--set',
    'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--command',
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    ...selected.flatMap(({ key, sql }) => [
      '--command',
      `COPY (SELECT json_build_object('__corgiCollection', '${String(key)}')::text UNION ALL SELECT row_to_json(source_row)::text FROM (${sql}) AS source_row) TO STDOUT;`,
    ]),
    '--command',
    'COMMIT;',
  ];
  const output = await runPsql(databaseUrl, args);
  const snapshot: Record<string, unknown[]> = Object.fromEntries(
    SOURCE_QUERIES.map(({ key }) => [key, []]),
  );
  let collection: string | undefined;

  for (const line of output.trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line) as Record<string, unknown>;
    if (typeof row.__corgiCollection === 'string') {
      collection = row.__corgiCollection;
      continue;
    }
    if (!collection || !snapshot[collection]) {
      throw new Error(
        'Source snapshot stream contained a row without a collection marker',
      );
    }
    snapshot[collection].push(row);
  }

  return snapshot as MinimalSnapshot;
};
