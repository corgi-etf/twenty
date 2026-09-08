import { type Page } from '@playwright/test';

import {
  createTwentyRestCanonicalizationApi,
  type CanonicalizationRequestContext,
} from '../../../corgi-crm-canonicalization/src/twenty-rest-api.ts';

export const createPlaywrightCanonicalizationApi = ({
  page,
  backendBaseUrl,
  frontendBaseUrl,
}: {
  page: Page;
  backendBaseUrl: string;
  frontendBaseUrl: string;
}) => {
  const checkpointFilePath = process.env.CRM_CANONICALIZATION_CHECKPOINT_PATH;
  if (!checkpointFilePath) {
    throw new Error('CRM_CANONICALIZATION_CHECKPOINT_PATH is required');
  }

  return createTwentyRestCanonicalizationApi({
    request: page.request as CanonicalizationRequestContext,
    backendBaseUrl,
    frontendBaseUrl,
    checkpointFilePath,
  });
};
