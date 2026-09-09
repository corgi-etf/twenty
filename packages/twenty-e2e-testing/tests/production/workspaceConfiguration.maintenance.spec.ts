import { expect, test } from '@playwright/test';

import {
  APPLY_WORKSPACE_CONFIG_CONFIRMATION,
  runWorkspaceConfiguration,
} from '../../../corgi-crm-workspace-config/src/execution.ts';
import { assertCompletedMetadataCleanup } from '../../../corgi-crm-workspace-config/src/cleanup-prerequisite.ts';
import { buildApprovedWholesalerTerritoryAssignments } from '../../../corgi-crm-workspace-config/src/planner.ts';
import {
  assertWorkspaceConfigTenant,
  createTwentyWorkspaceConfigApi,
  createWorkspaceConfigRequestGate,
  preflightWorkspaceConfigCheckpoint,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(
      `Required workspace configuration environment ${name} is unset`,
    );

  return value;
};

test.skip(
  process.env.CRM_WORKSPACE_CONFIG_ENABLED !== 'true',
  'Workspace configuration is available only through its manual production workflow.',
);

test('applies the territory-first workspace configuration', async ({
  page,
}) => {
  test.setTimeout(45 * 60_000);
  const confirmation = requiredEnvironmentValue(
    'CRM_WORKSPACE_CONFIG_CONFIRMATION',
  );
  expect(confirmation).toBe(APPLY_WORKSPACE_CONFIG_CONFIRMATION);
  const expectedCompanyCount = Number(
    requiredEnvironmentValue('CRM_WORKSPACE_CONFIG_COMPANY_COUNT'),
  );
  expect(Number.isSafeInteger(expectedCompanyCount)).toBe(true);
  expect(expectedCompanyCount).toBeGreaterThan(0);
  const wholesalerTerritoryAssignments =
    buildApprovedWholesalerTerritoryAssignments({
      graceWorkspaceMemberId: requiredEnvironmentValue(
        'CRM_GRACE_WORKSPACE_MEMBER_ID',
      ),
      kellyWorkspaceMemberId: requiredEnvironmentValue(
        'CRM_KELLY_WORKSPACE_MEMBER_ID',
      ),
      nashWorkspaceMemberId: requiredEnvironmentValue(
        'CRM_NASH_WORKSPACE_MEMBER_ID',
      ),
    });
  await assertCompletedMetadataCleanup({
    journalPath: requiredEnvironmentValue('CRM_METADATA_CLEANUP_JOURNAL_PATH'),
    expectedCompanyCount,
    expectedRowCoverageHash: requiredEnvironmentValue(
      'CRM_CANONICALIZATION_ROW_COVERAGE_SHA256',
    ),
    expectedBusinessContentHash: requiredEnvironmentValue(
      'CRM_CANONICALIZATION_BUSINESS_CONTENT_SHA256',
    ),
  });
  const runnerTemp = requiredEnvironmentValue('RUNNER_TEMP');
  const checkpointPath = await preflightWorkspaceConfigCheckpoint({
    runnerTemp,
    checkpointPath: requiredEnvironmentValue(
      'CRM_WORKSPACE_CONFIG_CHECKPOINT_PATH',
    ),
  });
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const origin = new URL(FRONTEND_BASE_URL).origin;
  const requestGate = createWorkspaceConfigRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin,
    requestGate,
  });
  const result = await runWorkspaceConfiguration(
    createTwentyWorkspaceConfigApi({
      request: page.request,
      backendBaseUrl: BACKEND_BASE_URL,
      frontendBaseUrl: FRONTEND_BASE_URL,
      checkpointFilePath: checkpointPath,
      requestGate,
    }),
    {
      origin,
      expectedOrigin: 'https://crm.corgiinvest.com',
      expectedCompanyCount,
      confirmation,
      wholesalerTerritoryAssignments,
    },
  );

  console.log(
    JSON.stringify({
      companyCount: result.companyCount,
      companyMutations: result.companyMutations,
      territoryMutations: result.territoryMutations,
      wholesalerCount: result.wholesalerCount,
      metadataMutations: result.metadataMutations,
      layoutMutations: result.layoutMutations,
      companyIdentityHash: result.companyIdentityHash,
      sourceProjectionHash: result.sourceProjectionHash,
      expectedProjectionHash: result.expectedProjectionHash,
      wholesalerIdentityHash: result.wholesalerIdentityHash,
      expectedTerritoryHash: result.expectedTerritoryHash,
    }),
  );
});
