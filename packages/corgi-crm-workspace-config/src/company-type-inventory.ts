import { getCorgiCompanyTypePresentation } from '../../twenty-shared/src/utils/company-type/getCorgiCompanyTypePresentation.ts';
import {
  WORKSPACE_CONFIG_APPROVED_ORIGIN,
  createWorkspaceConfigRequestGate,
  type WorkspaceConfigRequestContext,
} from './twenty-api.ts';

type CompanyTypeRecord = { id: string; firmType?: string | null };
export const buildCompanyTypeInventory = (
  companies: readonly CompanyTypeRecord[],
  expectedCompanyCount: number,
) => {
  if (
    !Number.isSafeInteger(expectedCompanyCount) ||
    expectedCompanyCount < 0 ||
    companies.length !== expectedCompanyCount ||
    companies.some(({ id }) => !id) ||
    new Set(companies.map(({ id }) => id)).size !== expectedCompanyCount
  )
    throw new Error(
      'Company type inventory requires exact distinct company coverage',
    );
  const counts = new Map<string, number>();
  let emptyCount = 0;
  for (const { firmType } of companies) {
    if (
      firmType !== undefined &&
      firmType !== null &&
      typeof firmType !== 'string'
    )
      throw new Error('Company firmType must remain text');
    if (!firmType?.trim()) {
      emptyCount++;
      continue;
    }
    counts.set(firmType, (counts.get(firmType) ?? 0) + 1);
  }
  const values = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([rawValue, count]) => {
      const presentation = getCorgiCompanyTypePresentation(rawValue)!;
      return {
        rawValue,
        count,
        category: presentation.category,
        label: presentation.label,
        color: presentation.color,
      };
    });
  return {
    companyCount: companies.length,
    emptyCount,
    values,
    unmapped: values
      .filter(({ category }) => category === 'unmapped')
      .map(({ rawValue, count }) => ({ rawValue, count })),
  };
};

// Call with the same authenticated, tenant-verified request context as the
// rollout previews. This helper exposes no record or metadata mutations.
export const readCompanyTypeInventory = async ({
  request,
  expectedCompanyCount,
  origin = WORKSPACE_CONFIG_APPROVED_ORIGIN,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: Pick<WorkspaceConfigRequestContext, 'post'>;
  expectedCompanyCount: number;
  origin?: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}) => {
  if (origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN)
    throw new Error('Unapproved company type inventory origin');
  if (!Number.isSafeInteger(expectedCompanyCount) || expectedCompanyCount < 0)
    throw new Error('Exact company count is required');
  const query = async (query: string, variables: Record<string, unknown>) => {
    const response = await requestGate(() =>
      request.post(`${origin}/graphql`, {
        headers: { Origin: origin },
        data: { query, variables },
      }),
    );
    try {
      if (!response.ok())
        throw new Error(
          `Company type inventory returned HTTP ${response.status()}`,
        );
      const body = (await response.json()) as {
        data?: {
          companies?: {
            edges?: Array<{ node: CompanyTypeRecord }>;
            totalCount?: number;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        };
        errors?: unknown;
      };
      if (
        !body.data?.companies ||
        (Array.isArray(body.errors)
          ? body.errors.length > 0
          : Boolean(body.errors))
      )
        throw new Error('Company type inventory query failed');
      return body.data.companies;
    } finally {
      await response.dispose();
    }
  };
  const companies: CompanyTypeRecord[] = [];
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const page = await query(
      'query CompanyTypeInventory($after:String) { companies(first:100,after:$after,orderBy:[{id:AscNullsFirst}]) { edges { node { id firmType } } totalCount pageInfo { hasNextPage endCursor } }',
      { after },
    );
    if (
      !Array.isArray(page.edges) ||
      typeof page.pageInfo?.hasNextPage !== 'boolean' ||
      page.totalCount !== expectedCompanyCount
    )
      throw new Error('Company type inventory count or pagination changed');
    companies.push(...page.edges.map(({ node }) => node));
    after = page.pageInfo.hasNextPage
      ? (page.pageInfo.endCursor ?? undefined)
      : undefined;
    if (
      page.pageInfo.hasNextPage &&
      (!after || cursors.has(after) || page.edges.length === 0)
    )
      throw new Error('Company type inventory pagination cursor is invalid');
    if (after) cursors.add(after);
  } while (after);
  const final = await query(
    'query CompanyTypeInventoryCount { companies(first:1) { totalCount } }',
    {},
  );
  if (final.totalCount !== expectedCompanyCount)
    throw new Error('Company type inventory count changed after pagination');
  return buildCompanyTypeInventory(companies, expectedCompanyCount);
};
