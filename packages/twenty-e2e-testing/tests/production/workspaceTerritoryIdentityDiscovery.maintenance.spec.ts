import { expect, test } from '@playwright/test';

import {
  preflightTerritoryIdentityArtifact,
  runTerritoryIdentityDiscovery,
  writeTerritoryIdentityArtifact,
} from '../../../corgi-crm-workspace-config/src/territory-identity-discovery.ts';
import {
  assertWorkspaceConfigTenant,
  createTwentyTerritoryIdentityDiscoveryApi,
  createWorkspaceConfigRequestGate,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Required territory identity discovery environment ${name} is unset`,
    );
  }

  return value;
};

test.skip(
  process.env.CRM_TERRITORY_IDENTITY_DISCOVERY_ENABLED !== 'true',
  'Territory identity discovery is available only through its guarded production workflow.',
);

test('discovers immutable territory member identities without mutation', async ({
  page,
}) => {
  test.setTimeout(15 * 60_000);
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const origin = new URL(FRONTEND_BASE_URL).origin;
  const requestGate = createWorkspaceConfigRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin,
    requestGate,
  });
  const artifact = await runTerritoryIdentityDiscovery(
    createTwentyTerritoryIdentityDiscoveryApi({
      request: page.request,
      backendBaseUrl: BACKEND_BASE_URL,
      frontendBaseUrl: FRONTEND_BASE_URL,
      requestGate,
    }),
  );
  expect(new Set(Object.values(artifact.workspaceMemberIds)).size).toBe(3);
  expect(artifact.aggregateIdentityHash).toMatch(/^[0-9a-f]{64}$/);
  const artifactPath = await preflightTerritoryIdentityArtifact({
    runnerTemp: requiredEnvironmentValue('RUNNER_TEMP'),
    artifactPath: requiredEnvironmentValue(
      'CRM_TERRITORY_IDENTITY_ARTIFACT_PATH',
    ),
  });
  await writeTerritoryIdentityArtifact(artifactPath, artifact);

  console.log(
    JSON.stringify({
      aggregateIdentityHash: artifact.aggregateIdentityHash,
    }),
  );
});
