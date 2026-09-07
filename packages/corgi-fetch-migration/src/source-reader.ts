export type SourceQuery = { key: string; sql: string };

const all = (table: string) => `SELECT * FROM ${table} ORDER BY 1`;

export const SOURCE_QUERIES: readonly SourceQuery[] = [
  { key: 'companies', sql: all('public.companies') },
  { key: 'companyLocations', sql: all('public.company_locations') },
  { key: 'contacts', sql: all('public.contacts') },
  { key: 'users', sql: all('public.app_user_roles') },
  { key: 'teams', sql: all('public.sales_teams') },
  { key: 'teamMemberships', sql: all('public.team_memberships') },
  { key: 'assignments', sql: all('public.daily_assignments') },
  { key: 'activities', sql: all('public.activities') },
  { key: 'followUps', sql: all('public.follow_ups') },
  { key: 'companySources', sql: all('public.company_sources') },
  { key: 'holdingObservations', sql: all('public.holding_observations') },
  { key: 'tags', sql: all('public.tags') },
  { key: 'companyTags', sql: all('public.company_tags') },
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
