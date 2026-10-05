import {
  type OwnershipBackfillApi,
  type OwnershipSnapshot,
} from './company-ownership-backfill.ts';
import {
  type OwnerCompany,
  type OwnerWholesaler,
  type Ownership,
} from './company-ownership-preview.ts';
import {
  WORKSPACE_CONFIG_APPROVED_ORIGIN,
  createWorkspaceConfigRequestGate,
  type WorkspaceConfigRequestContext,
} from './twenty-api.ts';

type Collection = 'companies' | 'wholesalers' | 'companyOwnerships';
const definition = {
  companies: {
    singular: 'Company',
    fields: 'id updatedAt accountOwnerId historicalOwnerId',
  },
  wholesalers: { singular: 'Wholesaler', fields: 'id workspaceMemberId' },
  companyOwnerships: {
    singular: 'CompanyOwnership',
    fields: 'id companyId wholesalerId isPrimary updatedAt deletedAt',
  },
};
const allIncludingDeleted = {
  or: [{ deletedAt: { is: 'NULL' } }, { deletedAt: { is: 'NOT_NULL' } }],
};
export const createOwnershipBackfillApi = ({
  request,
  origin = WORKSPACE_CONFIG_APPROVED_ORIGIN,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: WorkspaceConfigRequestContext;
  origin?: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}): OwnershipBackfillApi => {
  if (origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN)
    throw new Error('Unapproved ownership API origin');
  const graphql = async (query: string, variables: Record<string, unknown>) => {
    const response = await requestGate(() =>
      request.post(`${origin}/graphql`, {
        headers: { Origin: origin },
        data: { query, variables },
      }),
    );
    try {
      if (!response.ok())
        throw new Error(`Ownership API returned HTTP ${response.status()}`);
      const body = (await response.json()) as {
        data?: Record<string, unknown>;
        errors?: unknown[];
      };
      if (!body.data || body.errors?.length)
        throw new Error('Ownership API returned GraphQL errors');
      return body.data;
    } finally {
      await response.dispose();
    }
  };
  const list = async <T extends { id: string }>(
    collection: Collection,
    filter: Record<string, unknown> = {},
  ): Promise<T[]> => {
    const { singular, fields } = definition[collection];
    const query = `query OwnershipInventory($filter: ${singular}FilterInput, $after: String, $first: Int!) { ${collection}(filter: $filter, first: $first, after: $after, orderBy: [{id: AscNullsFirst}]) { edges { node { ${fields} } } pageInfo { hasNextPage endCursor } totalCount } }`;
    const result: T[] = [];
    const ids = new Set<string>();
    const cursors = new Set<string>();
    let after: string | undefined;
    let count: number | undefined;
    do {
      const data = await graphql(query, { filter, after, first: 100 });
      const page = data[collection] as {
        edges?: Array<{ node: T }>;
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        totalCount?: number;
      };
      if (
        !page ||
        !Array.isArray(page.edges) ||
        typeof page.pageInfo?.hasNextPage !== 'boolean' ||
        !Number.isSafeInteger(page.totalCount) ||
        page.totalCount! < 0
      )
        throw new Error('Ownership inventory page is incomplete');
      count ??= page.totalCount;
      if (page.totalCount !== count)
        throw new Error('Ownership inventory count changed during pagination');
      for (const { node } of page.edges) {
        if (!node?.id || ids.has(node.id))
          throw new Error('Ownership inventory duplicate or missing record');
        ids.add(node.id);
        result.push(node);
      }
      after = page.pageInfo.hasNextPage
        ? (page.pageInfo.endCursor ?? undefined)
        : undefined;
      if (
        page.pageInfo.hasNextPage &&
        (!after || cursors.has(after) || page.edges.length === 0)
      )
        throw new Error('Ownership inventory invalid pagination cursor');
      if (after) cursors.add(after);
    } while (after);
    if (result.length !== count)
      throw new Error(
        'Ownership inventory count does not match complete pagination',
      );
    const final = (await graphql(query, { filter, first: 1 }))[collection] as {
      totalCount: number;
    };
    if (final.totalCount !== count)
      throw new Error('Ownership inventory count changed after pagination');
    return result;
  };
  const readWholesalers = () => list<OwnerWholesaler>('wholesalers');
  const readOwnerships = (companyId?: string) =>
    list<Ownership>(
      'companyOwnerships',
      companyId
        ? { and: [allIncludingDeleted, { companyId: { eq: companyId } }] }
        : allIncludingDeleted,
    );
  return {
    readSnapshot: async (): Promise<OwnershipSnapshot> => ({
      companies: await list<OwnerCompany>('companies'),
      wholesalers: await readWholesalers(),
      existingOwnerships: await readOwnerships(),
    }),
    readCompany: async (id) => {
      const found = await list<OwnerCompany>('companies', { id: { eq: id } });
      if (found.length !== 1)
        throw new Error('Ownership source company missing');
      return found[0]!;
    },
    readWholesalers,
    readOwnerships,
    createOwnership: async (data) => {
      const result = await graphql(
        `mutation BackfillOwnership($data: CompanyOwnershipCreateInput!) { createCompanyOwnership(data: $data) { ${definition.companyOwnerships.fields} } }`,
        { data },
      );
      return result.createCompanyOwnership as Ownership;
    },
  };
};
