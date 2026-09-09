import { expect, test } from '@playwright/test';

import { createCanonicalizationRequestGate } from '../../../corgi-crm-canonicalization/src/request-gate.ts';
import {
  assertCanonicalizationTenant,
  CANONICALIZATION_APPROVED_WORKSPACE_ID,
} from '../../../corgi-crm-canonicalization/src/tenant-preflight.ts';
import { CANONICALIZATION_APPROVED_ORIGIN } from '../../../corgi-crm-canonicalization/src/twenty-rest-api.ts';
import {
  FETCH_METADATA_CLEANUP_CONFIRMATION,
  runFetchMetadataCleanup,
} from './fetchMetadataCleanup';
import { assertFetchMetadataCleanupWorkspace } from './fetchMetadataCleanupWorkspacePreflight';
import { createPlaywrightMetadataCleanupApi } from './playwrightMetadataCleanupApi';
import { requireProductionEnvironment } from './requireProductionEnvironment';

test.skip(
  process.env.CRM_METADATA_CLEANUP_ENABLED !== 'true',
  'Destructive metadata cleanup is available only through its manual workflow.',
);

test('permanently removes Fetch migration metadata from the production CRM', async ({
  page,
}) => {
  test.setTimeout(20 * 60_000);

  expect(process.env.CRM_METADATA_CLEANUP_CONFIRMATION).toBe(
    FETCH_METADATA_CLEANUP_CONFIRMATION,
  );
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  if (
    FRONTEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN ||
    BACKEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN
  ) {
    throw new Error('Production metadata cleanup origin is not approved');
  }
  const requestGate = createCanonicalizationRequestGate();
  await assertCanonicalizationTenant({
    request: page.request,
    requestGate,
    origin: new URL(FRONTEND_BASE_URL).origin,
    expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
  });
  const currentWorkspaceResponse = await page.request.post(
    new URL('/metadata', BACKEND_BASE_URL).toString(),
    {
      headers: { Origin: new URL(FRONTEND_BASE_URL).origin },
      data: {
        operationName: 'VerifyFetchMetadataCleanupWorkspace',
        query: `query VerifyFetchMetadataCleanupWorkspace {
          currentWorkspace {
            id
            customDomain
          }
        }`,
      },
    },
  );

  expect(currentWorkspaceResponse.ok()).toBe(true);
  const currentWorkspaceBody = await currentWorkspaceResponse.json();
  assertFetchMetadataCleanupWorkspace({
    body: currentWorkspaceBody,
    expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
    expectedHostname: new URL(FRONTEND_BASE_URL).hostname,
  });

  const plan = await runFetchMetadataCleanup(
    createPlaywrightMetadataCleanupApi({
      page,
      backendBaseUrl: BACKEND_BASE_URL,
      frontendBaseUrl: FRONTEND_BASE_URL,
    }),
  );

  console.log(
    JSON.stringify({
      deletedObjects: plan.objectsToDelete.map(
        ({ nameSingular }) => nameSingular,
      ),
      deletedFields: plan.fieldsToDelete.length,
      renamedFields: plan.fieldsToRename.length,
    }),
  );

  await page.goto('/wholesalers/map');
  await expect(
    page.getByRole('heading', { name: 'Territory map' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('wholesaler-coverage-map-ready')).toBeVisible({
    timeout: 60_000,
  });
});
