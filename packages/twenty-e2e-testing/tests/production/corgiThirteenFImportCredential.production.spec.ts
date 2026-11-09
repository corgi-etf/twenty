import { expect, test } from '@playwright/test';
import { chmod, readFile, rename, unlink, writeFile } from 'node:fs/promises';

import {
  cleanupImportCredential,
  createImportCredential,
  type GraphqlRequest,
  type ImportCredentialLease,
} from '../../../corgi-thirteen-f-import/src/credential.ts';
import { APPROVED_CRM_ORIGIN } from '../../../corgi-thirteen-f-import/src/constants.ts';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);

  return value;
};

test.describe.configure({ retries: 0 });

test.skip(
  !process.env.CORGI_13F_CREDENTIAL_OPERATION?.trim(),
  'Corgi 13F import credential management is workflow-only.',
);

test('manage the short-lived Corgi 13F import credential', async ({ page }) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  expect(origin).toBe(APPROVED_CRM_ORIGIN);
  const operation = requiredEnvironment('CORGI_13F_CREDENTIAL_OPERATION');
  const leasePath = requiredEnvironment('CORGI_13F_IMPORT_KEY_PATH');
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
    const recordLease = async (lease: ImportCredentialLease): Promise<void> => {
      const temporaryPath = `${leasePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(lease), { mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, leasePath);
      await chmod(leasePath, 0o600);
    };
    await createImportCredential({
      graphql,
      repository: requiredEnvironment('GITHUB_REPOSITORY'),
      runId: requiredEnvironment('GITHUB_RUN_ID'),
      runAttempt: requiredEnvironment('GITHUB_RUN_ATTEMPT'),
      recordLease,
    });

    return;
  }

  if (operation !== 'cleanup') {
    throw new Error(
      'CORGI_13F_CREDENTIAL_OPERATION must be acquire or cleanup',
    );
  }
  let lease: ImportCredentialLease;
  try {
    lease = JSON.parse(
      await readFile(leasePath, 'utf8'),
    ) as ImportCredentialLease;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await cleanupImportCredential({ graphql, lease });
  await unlink(leasePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
});
