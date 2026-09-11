import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  findWholesalerRolesByIds,
  findWholesalersByEmail,
  listWholesalerRoles,
  findWholesalersByWorkspaceMemberId,
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

const ROLE_LOOKUP_BATCH_SIZE = 50;
const MAX_ROLE_LOOKUP_BATCHES = 20;

// The role filter argument is UUID-typed, so a sentinel owner identity such as
// the report's 'unassigned' would make the server reject the whole query.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  public async findByEmail(email: string): Promise<WholesalerRecord[]> {
    return nodes(await findWholesalersByEmail(this.rawClient, email)).filter(
      (record) => normalizeEmail(record.email ?? '') === email,
    );
  }

  // Every classified wholesaler, not only those active in the window: an EW
  // with no calls that day still belongs in the EW sections, and the period's
  // own owners can never surface someone who did nothing.
  public async listAllRoles(): Promise<WholesalerRecord[]> {
    return nodes(
      await listWholesalerRoles(
        this.rawClient,
        ROLE_LOOKUP_BATCH_SIZE * MAX_ROLE_LOOKUP_BATCHES,
      ),
    );
  }

  public async findRolesByIds(
    wholesalerIds: string[],
  ): Promise<WholesalerRecord[]> {
    const uniqueIds = [
      ...new Set(
        wholesalerIds
          .map((wholesalerId) =>
            typeof wholesalerId === 'string' ? wholesalerId.trim() : '',
          )
          .filter((wholesalerId) => UUID_PATTERN.test(wholesalerId)),
      ),
    ];
    if (uniqueIds.length === 0) return [];
    if (uniqueIds.length > ROLE_LOOKUP_BATCH_SIZE * MAX_ROLE_LOOKUP_BATCHES) {
      // Classifying only the first batches would silently drop real EWs from
      // the report; the caller degrades the whole section instead.
      throw new Error('Wholesaler role lookup exceeded its batch budget');
    }
    const records = new Map<string, WholesalerRecord>();
    for (
      let offset = 0;
      offset < uniqueIds.length;
      offset += ROLE_LOOKUP_BATCH_SIZE
    ) {
      const batch = uniqueIds.slice(offset, offset + ROLE_LOOKUP_BATCH_SIZE);
      const result = await findWholesalerRolesByIds(this.rawClient, batch);
      for (const record of nodes(result)) records.set(record.id, record);
    }
    return [...records.values()];
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
