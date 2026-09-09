import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  findWholesalersByEmail,
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

const nodes = (result: {
  wholesalers?: { edges?: Array<{ node?: WholesalerRecord | null } | null> };
}): WholesalerRecord[] =>
  (result.wholesalers?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node): node is WholesalerRecord => Boolean(node?.id));

export class CoreWholesalerRepository implements WholesalerRepository {
  public constructor(private readonly client: CoreApiClient) {}

  public async findWorkspaceMemberById(memberId: string) {
    const result = await findWorkspaceMemberById(this.client, memberId);
    const node = result.workspaceMembers?.edges?.[0]?.node;
    if (!node?.id) return null;
    return { id: node.id, active: Boolean(node.userWorkspaceId) };
  }

  public async findByWorkspaceMemberId(
    memberId: string,
  ): Promise<WholesalerRecord[]> {
    return nodes(await findWholesalersByWorkspaceMemberId(this.client, memberId));
  }

  public async findByEmail(email: string): Promise<WholesalerRecord[]> {
    return nodes(await findWholesalersByEmail(this.client, email)).filter(
      (record) => normalizeEmail(record.email ?? '') === email,
    );
  }

  public async create(
    id: string,
    data: Required<WholesalerWrite>,
  ): Promise<WholesalerRecord> {
    const result = await createWholesaler(this.client, id, data);
    const createdId = result.createWholesaler?.id;
    if (!createdId) throw new Error('createWholesaler did not return an id');
    return { id: createdId, ...data };
  }

  public async update(
    id: string,
    data: WholesalerWrite,
  ): Promise<WholesalerRecord> {
    const result = await updateWholesaler(this.client, id, data);
    const updatedId = result.updateWholesaler?.id;
    if (!updatedId) throw new Error('updateWholesaler did not return an id');
    return { id: updatedId, ...data };
  }

  public async listWorkspaceMembers(cursor?: string) {
    const result = await listWorkspaceMembers(this.client, cursor);
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
