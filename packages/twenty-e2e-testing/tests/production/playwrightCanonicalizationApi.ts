import { type Page } from '@playwright/test';

import {
  createTwentyRestCanonicalizationApi,
  type CanonicalizationRequestContext,
} from '../../../corgi-crm-canonicalization/src/twenty-rest-api.ts';
import type { createCanonicalizationRequestGate } from '../../../corgi-crm-canonicalization/src/request-gate.ts';

export const createPlaywrightCanonicalizationApi = ({
  page,
  backendBaseUrl,
  frontendBaseUrl,
  requestGate,
}: {
  page: Page;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  requestGate: ReturnType<typeof createCanonicalizationRequestGate>;
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
    requestGate,
  });
};
