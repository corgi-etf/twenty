import { type Page } from '@playwright/test';

import {
  createTwentyActivityImportApi,
  type ActivityImportRequestContext,
  type createActivityImportRequestGate,
} from '../../../corgi-crm-activity-import/src/twenty-rest-api.ts';

export const createPlaywrightActivityImportApi = ({
  page,
  backendBaseUrl,
  frontendBaseUrl,
  checkpointPath,
  requestGate,
}: {
  page: Page;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  checkpointPath: string;
  requestGate: ReturnType<typeof createActivityImportRequestGate>;
}) =>
  createTwentyActivityImportApi({
    request: page.request as ActivityImportRequestContext,
    backendBaseUrl,
    frontendBaseUrl,
    checkpointPath,
    requestGate,
  });
