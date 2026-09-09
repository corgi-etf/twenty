import { type CoreApiClient } from 'twenty-client-sdk/core';

export const listWorkspaceMembers = (
  client: CoreApiClient,
  cursor?: string,
) =>
  client.query({
    workspaceMembers: {
      __args: { first: 100, ...(cursor ? { after: cursor } : {}) },
      edges: {
        node: {
          id: true,
          userEmail: true,
          name: { firstName: true, lastName: true },
        },
      },
      pageInfo: { hasNextPage: true, endCursor: true },
    },
  });
