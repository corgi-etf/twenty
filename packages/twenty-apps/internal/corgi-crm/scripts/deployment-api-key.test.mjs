import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDeploymentApiKey,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
} from './deployment-api-key.mjs';

const workspaceId = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const userWorkspaceId = '767771e9-834d-4a89-88ca-1df32d101a40';
const role = {
  id: 'role-1',
  canUpdateAllSettings: true,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canBeAssignedToApiKeys: true,
  permissionFlags: [
    { flag: 'API_KEYS_AND_WEBHOOKS' },
    { flag: 'APPLICATIONS' },
    { flag: 'MARKETPLACE_APPS' },
    { flag: 'ROLES' },
  ],
  workspaceMembers: [{ userWorkspaceId }],
};
const tenantData = {
  currentUser: {
    currentWorkspace: { id: workspaceId },
    currentUserWorkspace: {
      id: userWorkspaceId,
      permissionFlags: [
        'API_KEYS_AND_WEBHOOKS',
        'APPLICATIONS',
        'MARKETPLACE_APPS',
        'ROLES',
      ],
      isImpersonating: false,
    },
  },
  getRoles: [role],
};

describe('deployment API key helpers', () => {
  it('creates an exactly named 30-minute key on the approved role', async () => {
    const calls = [];
    const graphql = async (request) => {
      calls.push(request);
      if (calls.length === 1) return tenantData;
      return {
        createApiKey: {
          id: 'key-1',
          name: 'corgi-crm-deploy-123-2',
          expiresAt: '2026-09-08T12:30:00.000Z',
          revokedAt: null,
        },
      };
    };

    const key = await createDeploymentApiKey({
      graphql,
      expectedWorkspaceId: workspaceId,
      expectedUserWorkspaceId: userWorkspaceId,
      runId: '123',
      runAttempt: '2',
      now: new Date('2026-09-08T12:00:00.000Z'),
    });

    assert.deepEqual(key, {
      id: 'key-1',
      name: 'corgi-crm-deploy-123-2',
      expiresAt: '2026-09-08T12:30:00.000Z',
    });
    assert.deepEqual(calls[1].variables.input, {
      name: key.name,
      expiresAt: key.expiresAt,
      roleId: 'role-1',
    });
  });

  it('refuses to create a key for a different tenant', async () => {
    let calls = 0;
    const graphql = async () => {
      calls += 1;
      return {
        ...tenantData,
        currentUser: {
          ...tenantData.currentUser,
          currentWorkspace: { id: 'other-workspace' },
        },
      };
    };

    await assert.rejects(
      createDeploymentApiKey({
        graphql,
        expectedWorkspaceId: workspaceId,
        expectedUserWorkspaceId: userWorkspaceId,
        runId: '123',
        runAttempt: '1',
      }),
      /not the approved non-impersonated tenant membership/,
    );
    assert.equal(calls, 1);
  });

  it('generates a token bound to the key expiry', async () => {
    let request;
    const token = await generateDeploymentApiKeyToken({
      graphql: async (value) => {
        request = value;
        return { generateApiKeyToken: { token: 'short-lived-token' } };
      },
      key: { id: 'key-1', expiresAt: '2026-09-08T12:30:00.000Z' },
    });

    assert.equal(token, 'short-lived-token');
    assert.deepEqual(request.variables, {
      apiKeyId: 'key-1',
      expiresAt: '2026-09-08T12:30:00.000Z',
    });
  });

  it('revokes the exact key and verifies its revoked timestamp', async () => {
    const operations = [];
    await revokeDeploymentApiKey({
      graphql: async (request) => {
        operations.push(request.operationName);
        if (operations.length === 1) {
          return { revokeApiKey: { id: 'key-1' } };
        }
        return {
          apiKey: { id: 'key-1', revokedAt: '2026-09-08T12:10:00.000Z' },
        };
      },
      apiKeyId: 'key-1',
    });

    assert.deepEqual(operations, [
      'RevokeCorgiCrmDeploymentApiKey',
      'VerifyCorgiCrmDeploymentApiKeyRevoked',
    ]);
  });
});
