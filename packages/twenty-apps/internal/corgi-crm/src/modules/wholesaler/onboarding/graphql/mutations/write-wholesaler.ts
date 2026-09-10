import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { type WholesalerWrite } from 'src/modules/wholesaler/onboarding/types';

type RawCoreRequester = Pick<RawCoreGraphqlTransport, 'request'>;
type WholesalerMutationData = {
  createWholesaler?: { id?: string | null } | null;
  updateWholesaler?: { id?: string | null } | null;
};

export const CREATE_WHOLESALER_DOCUMENT = `
  mutation CorgiCreateWholesaler($data: WholesalerCreateInput!) {
    createWholesaler(data: $data) { id }
  }
`;

export const UPDATE_WHOLESALER_DOCUMENT = `
  mutation CorgiUpdateWholesaler($id: UUID!, $data: WholesalerUpdateInput!) {
    updateWholesaler(id: $id, data: $data) { id }
  }
`;

export const createWholesaler = (
  client: RawCoreRequester,
  id: string,
  data: Required<WholesalerWrite>,
) =>
  client.request<
    WholesalerMutationData,
    { data: Required<WholesalerWrite> & { id: string } }
  >({
    operationName: 'CorgiCreateWholesaler',
    document: CREATE_WHOLESALER_DOCUMENT,
    variables: { data: { id, ...data } },
  });

export const updateWholesaler = (
  client: RawCoreRequester,
  id: string,
  data: WholesalerWrite,
) =>
  client.request<
    WholesalerMutationData,
    { id: string; data: WholesalerWrite }
  >({
    operationName: 'CorgiUpdateWholesaler',
    document: UPDATE_WHOLESALER_DOCUMENT,
    variables: { id, data },
  });
