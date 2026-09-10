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

export const FIND_WHOLESALERS_BY_EMAIL_DOCUMENT = `
  query CorgiFindWholesalersByEmail($emailPattern: String!) {
    wholesalers(first: 3, filter: { email: { ilike: $emailPattern } }) {
      edges {
        node { id name email wholesalerRole workspaceMemberId }
      }
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
