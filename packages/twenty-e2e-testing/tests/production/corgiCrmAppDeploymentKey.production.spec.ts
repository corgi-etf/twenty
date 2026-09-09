import { expect, test } from '@playwright/test';
import { chmod, readFile, writeFile } from 'node:fs/promises';

import {
  createDeploymentApiKey,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
} from '../../../twenty-apps/internal/corgi-crm/scripts/deployment-api-key.mjs';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPROVED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const APPROVED_USER_WORKSPACE_ID = '767771e9-834d-4a89-88ca-1df32d101a40';

type GraphqlRequest = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
};

type DeploymentKeyFile = {
  id: string;
  token?: string;
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
    const key = await createDeploymentApiKey({
      graphql,
      expectedWorkspaceId: APPROVED_WORKSPACE_ID,
      expectedUserWorkspaceId: APPROVED_USER_WORKSPACE_ID,
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredEnvironment('GITHUB_RUN_ATTEMPT'),
    });
    await writeFile(keyPath, JSON.stringify({ id: key.id }), { mode: 0o600 });
    const token = await generateDeploymentApiKeyToken({ graphql, key });
    await writeFile(keyPath, JSON.stringify({ id: key.id, token }), {
      mode: 0o600,
    });
    await chmod(keyPath, 0o600);
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
  if (!keyFile.id?.trim()) {
    throw new Error('Deployment key file does not contain a key ID');
  }
  await revokeDeploymentApiKey({ graphql, apiKeyId: keyFile.id });
});
