import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { type WholesalerRecord } from 'src/modules/wholesaler/onboarding/types';
import { escapeSqlLikePattern } from 'src/modules/wholesaler/onboarding/utils/escape-sql-like-pattern';

type RawCoreRequester = Pick<RawCoreGraphqlTransport, 'request'>;

export type FindWholesalersData = {
  wholesalers: {
    edges: Array<{ node: WholesalerRecord }>;
  };
};

export const FIND_WHOLESALERS_BY_WORKSPACE_MEMBER_DOCUMENT = `
  query CorgiFindWholesalersByWorkspaceMember($memberId: UUID!) {
    wholesalers(first: 3, filter: { workspaceMemberId: { eq: $memberId } }) {
      edges {
        node { id name email wholesalerRole workspaceMemberId }
      }
    }
  }
`;

export const FIND_WHOLESALER_BY_ID_DOCUMENT = `
  query CorgiFindWholesalerById($wholesalerId: UUID!) {
    wholesalers(first: 2, filter: { id: { eq: $wholesalerId } }) {
      edges {
        node { id name email wholesalerRole workspaceMemberId }
      }
    }
  }
`;

export const FIND_WHOLESALERS_BY_EMAIL_DOCUMENT = `
  query CorgiFindWholesalersByEmail($emailPattern: String!) {
    wholesalers(first: 3, filter: { email: { ilike: $emailPattern } }) {
      edges {
        node { id name email wholesalerRole workspaceMemberId }
      }
    }
  }
`;

export type ListWholesalersData = {
  wholesalers: {
    edges: Array<{ node: WholesalerRecord }>;
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  };
};

export const LIST_WHOLESALERS_DOCUMENT = `
  query CorgiListWholesalers($first: Int!, $after: String) {
    wholesalers(first: $first, after: $after) {
      edges {
        node { id name email wholesalerRole workspaceMemberId }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const findWholesalersByWorkspaceMemberId = (
  client: RawCoreRequester,
  memberId: string,
) =>
  client.request<FindWholesalersData, { memberId: string }>({
    operationName: 'CorgiFindWholesalersByWorkspaceMember',
    document: FIND_WHOLESALERS_BY_WORKSPACE_MEMBER_DOCUMENT,
    variables: { memberId },
  });

export const findWholesalersByEmail = (
  client: RawCoreRequester,
  email: string,
) =>
  client.request<FindWholesalersData, { emailPattern: string }>({
    operationName: 'CorgiFindWholesalersByEmail',
    document: FIND_WHOLESALERS_BY_EMAIL_DOCUMENT,
    variables: { emailPattern: escapeSqlLikePattern(email) },
  });

export const findWholesalerById = (
  client: RawCoreRequester,
  wholesalerId: string,
) =>
  client.request<FindWholesalersData, { wholesalerId: string }>({
    operationName: 'CorgiFindWholesalerById',
    document: FIND_WHOLESALER_BY_ID_DOCUMENT,
    variables: { wholesalerId },
  });

// Roles are read for the whole roster rather than filtered server-side: the
// stored value is human-entered, so only a normalized comparison in code can
// match spacing and casing variants.
export const listWholesalersPage = (
  client: RawCoreRequester,
  variables: { first: number; after: string | null },
) =>
  client.request<ListWholesalersData, { first: number; after: string | null }>({
    operationName: 'CorgiListWholesalers',
    document: LIST_WHOLESALERS_DOCUMENT,
    variables,
  });
