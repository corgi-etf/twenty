import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type WholesalerWrite } from 'src/modules/wholesaler/onboarding/types';

export const createWholesaler = (
  client: CoreApiClient,
  id: string,
  data: Required<WholesalerWrite>,
) =>
  client.mutation({
    createWholesaler: { __args: { data: { id, ...data } }, id: true },
  });

export const updateWholesaler = (
  client: CoreApiClient,
  id: string,
  data: WholesalerWrite,
) =>
  client.mutation({
    updateWholesaler: { __args: { id, data }, id: true },
  });
