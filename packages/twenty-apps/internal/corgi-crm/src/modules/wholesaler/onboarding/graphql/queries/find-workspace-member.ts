import { type CoreApiClient } from 'twenty-client-sdk/core';

export const findWorkspaceMemberById = (
  client: CoreApiClient,
  workspaceMemberId: string,
) =>
  client.query({
    workspaceMembers: {
      __args: {
        filter: { id: { eq: workspaceMemberId } },
        first: 1,
      },
      edges: { node: { id: true, userWorkspaceId: true } },
    },
  });
