import { expect, test } from '@playwright/test';

import { APPLICATION_ID } from './corgiThirteenFDeploymentState.mjs';
import { upgradeCorgiThirteenFWithUserSession } from './corgiThirteenFUserSessionUpgrade.mjs';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';

type GraphqlRequest = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
};

type UpgradeSnapshot = {
  currentWorkspace?: { id?: string; displayName?: string };
  currentUser?: {
    currentWorkspace?: { id?: string; displayName?: string };
    currentUserWorkspace?: {
      id?: string;
      permissionFlags?: string[];
      isImpersonating?: boolean;
    };
  };
  registration?: Record<string, unknown> | null;
  applications?: Array<Record<string, unknown>>;
};

type UpgradeMutation = {
  upgradeApplication?: boolean;
};

type UpgradeInput = {
  appRegistrationId: string;
  targetVersion: string;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

test.describe.configure({ retries: 0 });

test.skip(
  process.env.CORGI_THIRTEEN_F_USER_SESSION_UPGRADE?.trim() !== 'true',
  'Corgi 13F user-session upgrade is workflow-only.',
);

test('upgrade the exact Corgi 13F release through the proven user session', async ({
  page,
}) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  expect(origin).toBe(APPROVED_ORIGIN);

  const graphql = async <Data extends object>({
    operationName,
    query,
    variables = {},
  }: GraphqlRequest): Promise<Data> => {
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
      data?: Data;
      errors?: unknown[];
    };
    if (!body.data || (Array.isArray(body.errors) && body.errors.length > 0)) {
      throw new Error(`${operationName} returned GraphQL errors or no data`);
    }
    return body.data;
  };

  const readSnapshot = async () => {
    const data = await graphql<UpgradeSnapshot>({
      operationName: 'ReadCorgiThirteenFUserSessionUpgradeState',
      query: `query ReadCorgiThirteenFUserSessionUpgradeState(
        $applicationId: String!
      ) {
        currentWorkspace { id displayName }
        currentUser {
          currentWorkspace { id displayName }
          currentUserWorkspace { id permissionFlags isImpersonating }
        }
        registration: findApplicationRegistrationByUniversalIdentifier(
          universalIdentifier: $applicationId
        ) {
          id universalIdentifier name sourceType latestAvailableVersion
          ownerWorkspaceId isListed
        }
        applications: findManyApplications {
          id universalIdentifier version state applicationRegistrationId
        }
      }`,
      variables: { applicationId: APPLICATION_ID },
    });

    return data;
  };

  const result = await upgradeCorgiThirteenFWithUserSession({
    expectedUserWorkspaceId: requiredEnvironment(
      'CORGI_CRM_EXPECTED_USER_WORKSPACE_ID',
    ),
    readSnapshot,
    requestUpgrade: async ({
      appRegistrationId,
      targetVersion,
    }: UpgradeInput) => {
      const data = await graphql<UpgradeMutation>({
        operationName: 'UpgradeCorgiThirteenFThroughUserSession',
        query: `mutation UpgradeCorgiThirteenFThroughUserSession(
          $appRegistrationId: String!
          $targetVersion: String!
        ) {
          upgradeApplication(
            appRegistrationId: $appRegistrationId
            targetVersion: $targetVersion
          )
        }`,
        variables: { appRegistrationId, targetVersion },
      });
      return data.upgradeApplication === true;
    },
    wait: () => new Promise((resolve) => setTimeout(resolve, 5_000)),
  });

  expect(['already-installed', 'upgraded']).toContain(result.status);
});
