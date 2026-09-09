import { expect, test } from '@playwright/test';

import { assertCompletedWorkspaceMetadataBootstrap } from '../../../corgi-crm-workspace-config/src/metadata-bootstrap-artifact.ts';
import {
  assertWorkspaceConfigTenant,
  createWorkspaceConfigRequestGate,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required metadata prerequisite ${name} is unset`);
  }

  return value;
};

test.skip(
  process.env.CRM_WORKSPACE_METADATA_PREREQUISITE_ENABLED !== 'true',
  'Workspace metadata prerequisite verification is workflow-only.',
);

test('proves the exact deployed revision completed metadata bootstrap', async ({
  page,
}) => {
  const artifact = await assertCompletedWorkspaceMetadataBootstrap({
    artifactPath: requiredEnvironmentValue(
      'CRM_WORKSPACE_METADATA_BOOTSTRAP_ARTIFACT_PATH',
    ),
    expectedDeployedSha: requiredEnvironmentValue('CRM_DEPLOYED_SHA'),
  });
  const { FRONTEND_BASE_URL } = requireProductionEnvironment();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin: new URL(FRONTEND_BASE_URL).origin,
    requestGate: createWorkspaceConfigRequestGate(),
  });
  expect(artifact.status).toBe('complete');
});
