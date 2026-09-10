import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  findWholesalerById,
  findWholesalersByEmail,
  findWholesalersByWorkspaceMemberId,
  listWholesalersPage,
} from 'src/modules/wholesaler/onboarding/graphql/queries/find-wholesalers';
import { findWorkspaceMemberById } from 'src/modules/wholesaler/onboarding/graphql/queries/find-workspace-member';
import { listWorkspaceMembers } from 'src/modules/wholesaler/onboarding/graphql/queries/list-workspace-members';
import {
  createWholesaler,
  updateWholesaler,
} from 'src/modules/wholesaler/onboarding/graphql/mutations/write-wholesaler';
import {
  type WholesalerRecord,
  type WholesalerRepository,
  type WholesalerWrite,
  type WorkspaceMemberIdentity,
} from 'src/modules/wholesaler/onboarding/types';
import { normalizeEmail } from 'src/modules/wholesaler/onboarding/utils/normalize-member-identity';

type GeneratedCoreClient = Pick<CoreApiClient, 'query'>;
type RawCoreRequester = Pick<RawCoreGraphqlTransport, 'request'>;

const ROSTER_PAGE_SIZE = 100;
const ROSTER_MAX_PAGES = 100;

const isNullableString = (value: unknown): value is string | null | undefined =>
  value === null || value === undefined || typeof value === 'string';

const nodes = (result: unknown): WholesalerRecord[] => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Wholesaler query returned malformed data');
  }
  const connection = (result as { wholesalers?: unknown }).wholesalers;
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    throw new Error('Wholesaler query returned a malformed connection');
  }
  const edges = (connection as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) {
    throw new Error('Wholesaler query returned a malformed connection');
  }
  return edges.map((edge) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw new Error('Wholesaler query returned a malformed record');
    }
    const node = (edge as { node?: unknown }).node;
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('Wholesaler query returned a malformed record');
    }
    const record = node as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      !record.id.trim() ||
      !isNullableString(record.name) ||
      !isNullableString(record.email) ||
      !isNullableString(record.wholesalerRole) ||
      !isNullableString(record.workspaceMemberId)
    ) {
      throw new Error('Wholesaler query returned a malformed record');
    }
    return record as WholesalerRecord;
  });
};

const connectionPageInfo = (
  result: unknown,
): { hasNextPage: boolean; endCursor?: string } => {
  const connection = (result as { wholesalers?: unknown }).wholesalers as
    | { pageInfo?: unknown }
    | undefined;
  const pageInfo = connection?.pageInfo;
  if (!pageInfo || typeof pageInfo !== 'object' || Array.isArray(pageInfo)) {
    throw new Error('Wholesaler query returned a malformed connection');
  }
  const { hasNextPage, endCursor } = pageInfo as {
    hasNextPage?: unknown;
    endCursor?: unknown;
  };
  if (typeof hasNextPage !== 'boolean' || !isNullableString(endCursor)) {
    throw new Error('Wholesaler query returned a malformed connection');
  }
  return { hasNextPage, endCursor: endCursor?.trim() || undefined };
};

export class CoreWholesalerRepository implements WholesalerRepository {
  public constructor(
    private readonly generatedClient: GeneratedCoreClient,
    private readonly rawClient: RawCoreRequester,
  ) {}

  public async findWorkspaceMemberById(memberId: string) {
    const result = await findWorkspaceMemberById(
      this.generatedClient as CoreApiClient,
      memberId,
    );
    const node = result.workspaceMembers?.edges?.[0]?.node;
    if (!node?.id) return null;
    return { id: node.id, active: Boolean(node.userWorkspaceId) };
  }

  public async findByWorkspaceMemberId(
    memberId: string,
  ): Promise<WholesalerRecord[]> {
    return nodes(
      await findWholesalersByWorkspaceMemberId(this.rawClient, memberId),
    );
  }

  public async findById(id: string): Promise<WholesalerRecord | null> {
    const records = nodes(await findWholesalerById(this.rawClient, id));
    if (records.length > 1) throw new Error('Wholesaler ID is not unique');
    const record = records[0];
    if (!record) return null;
    if (record.id !== id) {
      throw new Error('Wholesaler query returned a different record');
    }
    return record;
  }

  public async findByEmail(email: string): Promise<WholesalerRecord[]> {
    return nodes(await findWholesalersByEmail(this.rawClient, email)).filter(
      (record) => normalizeEmail(record.email ?? '') === email,
    );
  }

  public async listWholesalers(): Promise<WholesalerRecord[]> {
    const output: WholesalerRecord[] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < ROSTER_MAX_PAGES; page += 1) {
      const result = await listWholesalersPage(this.rawClient, {
        first: ROSTER_PAGE_SIZE,
        after: cursor,
      });
      for (const record of nodes(result)) {
        if (seenIds.has(record.id)) continue;
        seenIds.add(record.id);
        output.push(record);
      }
      const pageInfo = connectionPageInfo(result);
      if (!pageInfo.hasNextPage) return output;
      if (!pageInfo.endCursor || seenCursors.has(pageInfo.endCursor)) {
        throw new Error(
          'Wholesaler pagination has a missing or repeated cursor',
        );
      }
      seenCursors.add(pageInfo.endCursor);
      cursor = pageInfo.endCursor;
    }
    throw new Error(`Wholesaler pagination exceeded ${ROSTER_MAX_PAGES} pages`);
  }

  public async create(
    id: string,
    data: Required<WholesalerWrite>,
  ): Promise<WholesalerRecord> {
    const result = await createWholesaler(this.rawClient, id, data);
    const createdId = result.createWholesaler?.id;
    if (createdId !== id) {
      throw new Error('createWholesaler did not return the requested id');
    }
    return { id: createdId, ...data };
  }

  public async update(
    id: string,
    data: WholesalerWrite,
  ): Promise<WholesalerRecord> {
    const result = await updateWholesaler(this.rawClient, id, data);
    const updatedId = result.updateWholesaler?.id;
    if (updatedId !== id) {
      throw new Error('updateWholesaler did not return the requested id');
    }
    return { id: updatedId, ...data };
  }

  public async listWorkspaceMembers(cursor?: string) {
    const result = await listWorkspaceMembers(
      this.generatedClient as CoreApiClient,
      cursor,
    );
    const connection = result.workspaceMembers;
    const members = (connection?.edges ?? [])
      .map((edge: {
        node?: {
          id?: string | null;
          userEmail?: string | null;
          name?: {
            firstName?: string | null;
            lastName?: string | null;
          } | null;
        } | null;
      }): WorkspaceMemberIdentity | undefined => {
        const node = edge?.node;
        if (!node?.id) return undefined;
        return {
          id: node.id,
          email: node.userEmail ?? '',
          firstName: node.name?.firstName,
          lastName: node.name?.lastName,
        };
      })
      .filter(
        (member: WorkspaceMemberIdentity | undefined): member is WorkspaceMemberIdentity =>
          Boolean(member),
      );
    const pageInfo = connection?.pageInfo;
    if (pageInfo?.hasNextPage && !pageInfo.endCursor) {
      throw new Error('Workspace member pagination omitted its cursor');
    }
    return {
      members,
      nextCursor: pageInfo?.hasNextPage
        ? (pageInfo.endCursor ?? undefined)
        : undefined,
    };
  }
}
