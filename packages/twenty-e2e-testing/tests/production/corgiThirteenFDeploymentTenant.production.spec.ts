import { expect, test } from '@playwright/test';
import { appendFile, chmod } from 'node:fs/promises';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPROVED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const APPROVED_WORKSPACE_NAME = 'Corgi ETF';
const REQUIRED_PERMISSION_FLAGS = [
  'API_KEYS_AND_WEBHOOKS',
  'APPLICATIONS',
  'MARKETPLACE_APPS',
  'ROLES',
];

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

test.describe.configure({ retries: 0 });

test.skip(
  !process.env.CORGI_THIRTEEN_F_TENANT_ENV_PATH?.trim(),
  'Corgi 13F deployment tenant verification is workflow-only.',
);

test('prove the exact non-impersonated Corgi ETF tenant', async ({ page }) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  const expectedWorkspaceName = requiredEnvironment('CRM_E2E_WORKSPACE_NAME');

  expect(origin).toBe(APPROVED_ORIGIN);
  expect(expectedWorkspaceName).toBe(APPROVED_WORKSPACE_NAME);

  const response = await page.request.post(new URL('/metadata', origin).href, {
    headers: { Origin: origin },
    data: {
      operationName: 'VerifyCorgiThirteenFDeploymentTenant',
      query: `query VerifyCorgiThirteenFDeploymentTenant {
        currentWorkspace { id displayName }
        currentUser {
          currentWorkspace { id displayName }
          currentUserWorkspace { id permissionFlags isImpersonating }
        }
      }`,
    },
  });

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    data?: {
      currentWorkspace?: { id?: string; displayName?: string };
      currentUser?: {
        currentWorkspace?: { id?: string; displayName?: string };
        currentUserWorkspace?: {
          id?: string;
          permissionFlags?: string[];
          isImpersonating?: boolean;
        };
      };
    };
    errors?: unknown[];
  };

  expect(body.errors).toBeUndefined();
  expect(body.data?.currentWorkspace).toEqual({
    id: APPROVED_WORKSPACE_ID,
    displayName: APPROVED_WORKSPACE_NAME,
  });
  expect(body.data?.currentUser?.currentWorkspace).toEqual({
    id: APPROVED_WORKSPACE_ID,
    displayName: APPROVED_WORKSPACE_NAME,
  });

  const membership = body.data?.currentUser?.currentUserWorkspace;

  expect(membership?.isImpersonating).not.toBe(true);
  expect(membership?.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  for (const flag of REQUIRED_PERMISSION_FLAGS) {
    expect(membership?.permissionFlags).toContain(flag);
  }

  const environmentPath = requiredEnvironment(
    'CORGI_THIRTEEN_F_TENANT_ENV_PATH',
  );

  await appendFile(
    environmentPath,
    [
      `CORGI_CRM_EXPECTED_WORKSPACE_ID=${APPROVED_WORKSPACE_ID}`,
      `CORGI_CRM_EXPECTED_USER_WORKSPACE_ID=${membership?.id}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await chmod(environmentPath, 0o600);
});
