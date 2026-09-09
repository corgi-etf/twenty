import { type CoreApiClient } from 'twenty-client-sdk/core';

import { escapeSqlLikePattern } from 'src/modules/wholesaler/onboarding/utils/escape-sql-like-pattern';

const selection = {
  id: true,
  name: true,
  email: true,
  wholesalerRole: true,
  workspaceMemberId: true,
} as const;

export const findWholesalersByWorkspaceMemberId = (
  client: CoreApiClient,
  memberId: string,
) =>
  client.query({
    wholesalers: {
      __args: {
        filter: { workspaceMemberId: { eq: memberId } },
        first: 3,
      },
      edges: { node: selection },
    },
  });

export const findWholesalersByEmail = (client: CoreApiClient, email: string) =>
  client.query({
    wholesalers: {
      __args: {
        filter: { email: { ilike: escapeSqlLikePattern(email) } },
        first: 3,
      },
      edges: { node: selection },
    },
  });
