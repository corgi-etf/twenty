import { expect, test } from '@playwright/test';
import { chmod, readFile, writeFile } from 'node:fs/promises';

import {
  createDeploymentApiKey,
  deleteEphemeralDeploymentRole,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
} from '../../../twenty-apps/internal/corgi-crm/scripts/deployment-api-key.mjs';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';

type GraphqlRequest = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
};

type DeploymentKeyFile = {
  id?: string;
  name?: string;
  expiresAt?: string;
  token?: string;
  role?: {
    id: string;
    label?: string;
    description?: string;
    ephemeral: boolean;
  };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

test.describe.configure({ retries: 0 });

test.skip(
  !process.env.CORGI_CRM_DEPLOYMENT_KEY_OPERATION?.trim(),
  'Corgi CRM deployment key management is workflow-only.',
);

test('manage the short-lived Corgi CRM deployment key', async ({ page }) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  expect(origin).toBe(APPROVED_ORIGIN);
  const operation = requiredEnvironment('CORGI_CRM_DEPLOYMENT_KEY_OPERATION');
  const keyPath = requiredEnvironment('CORGI_CRM_DEPLOYMENT_KEY_PATH');

  const graphql = async ({
    operationName,
    query,
    variables = {},
  }: GraphqlRequest): Promise<Record<string, unknown>> => {
    const response = await page.request.post(
      new URL('/metadata', origin).href,
      {
        headers: { Origin: origin },
        data: { operationName, query, variables },
      },
    );
    if (!response.ok()) {
      throw new Error(`${operationName} failed with HTTP ${response.status()}`);
    }
    const body = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: unknown;
    };
    if ((Array.isArray(body.errors) && body.errors.length > 0) || !body.data) {
      throw new Error(`${operationName} returned GraphQL errors or no data`);
    }
    return body.data;
  };

  if (operation === 'acquire') {
    const recordLease = async (lease: DeploymentKeyFile): Promise<void> => {
      await writeFile(keyPath, JSON.stringify(lease), { mode: 0o600 });
      await chmod(keyPath, 0o600);
    };
    const key = await createDeploymentApiKey({
      graphql,
      expectedWorkspaceId: requiredEnvironment(
        'CORGI_CRM_EXPECTED_WORKSPACE_ID',
      ),
      expectedUserWorkspaceId: requiredEnvironment(
        'CORGI_CRM_EXPECTED_USER_WORKSPACE_ID',
      ),
      repository: requiredEnvironment('GITHUB_REPOSITORY'),
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredEnvironment('GITHUB_RUN_ATTEMPT'),
      recordLease,
    });
    const token = await generateDeploymentApiKeyToken({ graphql, key });
    await recordLease({ ...key, token });
    return;
  }

  if (operation !== 'revoke') {
    throw new Error(
      'CORGI_CRM_DEPLOYMENT_KEY_OPERATION must be acquire or revoke',
    );
  }
  let keyFile: DeploymentKeyFile;
  try {
    keyFile = JSON.parse(await readFile(keyPath, 'utf8')) as DeploymentKeyFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  let cleanupError: unknown;
  if (keyFile.id?.trim()) {
    try {
      await revokeDeploymentApiKey({ graphql, apiKeyId: keyFile.id });
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    await deleteEphemeralDeploymentRole({ graphql, role: keyFile.role });
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) throw cleanupError;
});
