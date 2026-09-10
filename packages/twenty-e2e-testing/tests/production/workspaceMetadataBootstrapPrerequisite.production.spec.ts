import { expect, test } from '@playwright/test';
import { appendFile } from 'node:fs/promises';

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
  const validated = await assertCompletedWorkspaceMetadataBootstrap({
    artifactPath: requiredEnvironmentValue(
      'CRM_WORKSPACE_METADATA_BOOTSTRAP_ARTIFACT_PATH',
    ),
    expectedDeployedSha: requiredEnvironmentValue('CRM_DEPLOYED_SHA'),
  });
  const { FRONTEND_BASE_URL } = requireProductionEnvironment();
  const tenant = await assertWorkspaceConfigTenant({
    request: page.request,
    origin: new URL(FRONTEND_BASE_URL).origin,
    requestGate: createWorkspaceConfigRequestGate(),
  });
  expect(validated.workspaceId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(tenant.workspaceId).toBe(validated.workspaceId);
  const workspaceEnvironmentPath = requiredEnvironmentValue(
    'CRM_WORKSPACE_ENV_PATH',
  );
  await appendFile(
    workspaceEnvironmentPath,
    `CORGI_CRM_EXPECTED_WORKSPACE_ID=${validated.workspaceId}\n`,
    'utf8',
  );
  expect(validated.status).toBe('complete');
});
