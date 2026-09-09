import { expect, test } from '@playwright/test';

import {
  BOOTSTRAP_WORKSPACE_METADATA_CONFIRMATION,
  runWorkspaceMetadataBootstrap,
} from '../../../corgi-crm-workspace-config/src/execution.ts';
import {
  buildWorkspaceMetadataBootstrapArtifact,
  preflightWorkspaceMetadataBootstrapArtifact,
  writeWorkspaceMetadataBootstrapArtifact,
} from '../../../corgi-crm-workspace-config/src/metadata-bootstrap-artifact.ts';
import { assertCompletedMetadataCleanup } from '../../../corgi-crm-workspace-config/src/cleanup-prerequisite.ts';
import {
  assertWorkspaceConfigTenant,
  createTwentyWorkspaceMetadataBootstrapApi,
  createWorkspaceConfigRequestGate,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Required workspace metadata bootstrap environment ${name} is unset`,
    );
  }

  return value;
};

test.skip(
  process.env.CRM_WORKSPACE_METADATA_BOOTSTRAP_ENABLED !== 'true',
  'Workspace metadata bootstrap is available only through its guarded production workflow.',
);

test('bootstraps and verifies only the CRM metadata needed by the app', async ({
  page,
}) => {
  test.setTimeout(30 * 60_000);
  const confirmation = requiredEnvironmentValue(
    'CRM_WORKSPACE_METADATA_BOOTSTRAP_CONFIRMATION',
  );
  expect(confirmation).toBe(BOOTSTRAP_WORKSPACE_METADATA_CONFIRMATION);
  const deployedSha = requiredEnvironmentValue('CRM_DEPLOYED_SHA');
  expect(deployedSha).toMatch(/^[0-9a-f]{40}$/);
  const expectedCompanyCount = Number(
    requiredEnvironmentValue('CRM_WORKSPACE_CONFIG_COMPANY_COUNT'),
  );
  expect(Number.isSafeInteger(expectedCompanyCount)).toBe(true);
  expect(expectedCompanyCount).toBeGreaterThan(0);
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
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const origin = new URL(FRONTEND_BASE_URL).origin;
  const requestGate = createWorkspaceConfigRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin,
    requestGate,
  });
  const result = await runWorkspaceMetadataBootstrap(
    createTwentyWorkspaceMetadataBootstrapApi({
      request: page.request,
      backendBaseUrl: BACKEND_BASE_URL,
      frontendBaseUrl: FRONTEND_BASE_URL,
      requestGate,
    }),
    {
      origin,
      expectedOrigin: 'https://crm.corgiinvest.com',
      confirmation,
    },
  );
  expect(result.metadataContractHash).toMatch(/^[0-9a-f]{64}$/);

  const artifactPath = await preflightWorkspaceMetadataBootstrapArtifact({
    runnerTemp: requiredEnvironmentValue('RUNNER_TEMP'),
    artifactPath: requiredEnvironmentValue(
      'CRM_WORKSPACE_METADATA_BOOTSTRAP_ARTIFACT_PATH',
    ),
  });
  await writeWorkspaceMetadataBootstrapArtifact(
    artifactPath,
    buildWorkspaceMetadataBootstrapArtifact({ deployedSha }),
  );

  console.log(
    JSON.stringify({
      metadataMutations: result.metadataMutations,
      metadataContractHash: result.metadataContractHash,
    }),
  );
});
