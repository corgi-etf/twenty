import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDeploymentApiKey,
  deleteEphemeralDeploymentRole,
  deploymentRoleIdentity,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
} from './deployment-api-key.mjs';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const userWorkspaceId = '22222222-2222-4222-8222-222222222222';
const REQUIRED_PERMISSION_FLAGS = [
  'API_KEYS_AND_WEBHOOKS',
  'APPLICATIONS',
  'MARKETPLACE_APPS',
  'ROLES',
];
const role = {
  id: 'role-1',
  canReadAllObjectRecords: true,
  canBeAssignedToApiKeys: true,
  permissionFlags: [
    { flag: 'API_KEYS_AND_WEBHOOKS' },
    { flag: 'APPLICATIONS' },
    { flag: 'MARKETPLACE_APPS' },
    { flag: 'ROLES' },
  ],
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
      role: { id: 'role-1', ephemeral: false },
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

  it('creates a run-owned least-privilege role when no API-key role exists', async () => {
    const calls = [];
    const graphql = async (request) => {
      calls.push(request);
      if (request.operationName === 'CorgiCrmDeploymentCredentialPreflight') {
        return { ...tenantData, getRoles: [] };
      }
      if (request.operationName === 'CreateCorgiCrmDeploymentRole') {
        return {
          createOneRole: {
            ...request.variables.input,
            permissionFlags: [],
          },
        };
      }
      if (request.operationName === 'ConfigureCorgiCrmDeploymentRole') {
        return {
          upsertPermissionFlags: REQUIRED_PERMISSION_FLAGS.map(
            (flag, index) => ({
              id: `flag-${index}`,
              roleId: request.variables.input.roleId,
              flag,
            }),
          ),
        };
      }
      return {
        createApiKey: {
          id: 'key-1',
          name: 'corgi-crm-deploy-123-1',
          expiresAt: '2026-09-08T12:30:00.000Z',
          revokedAt: null,
        },
      };
    };

    const key = await createDeploymentApiKey({
      graphql,
      expectedWorkspaceId: workspaceId,
      expectedUserWorkspaceId: userWorkspaceId,
      repository: 'Corgi-ETF/twenty',
      runId: '123',
      runAttempt: '1',
      now: new Date('2026-09-08T12:00:00.000Z'),
    });

    assert.equal(key.id, 'key-1');
    assert.equal(key.role.ephemeral, true);
    assert.deepEqual(
      calls.find(
        ({ operationName }) => operationName === 'CreateCorgiCrmDeploymentRole',
      ).variables.input,
      {
        id: key.role.id,
        label: key.role.label,
        description: key.role.description,
        icon: 'IconKey',
        canUpdateAllSettings: false,
        canAccessAllTools: false,
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: false,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: true,
      },
    );
  });

  it('fails closed when the deployment role selection is ambiguous', async () => {
    await assert.rejects(
      createDeploymentApiKey({
        graphql: async () => ({
          ...tenantData,
          getRoles: [role, { ...role, id: 'role-2' }],
        }),
        expectedWorkspaceId: workspaceId,
        expectedUserWorkspaceId: userWorkspaceId,
        runId: '123',
        runAttempt: '1',
      }),
      /found 2/,
    );
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

  it('deletes only an exactly owned ephemeral deployment role', async () => {
    const ownedRole = {
      ...deploymentRoleIdentity({
        repository: 'Corgi-ETF/twenty',
        workspaceId,
        runId: '123',
        runAttempt: '1',
      }),
    };
    const exactRole = {
      id: ownedRole.id,
      label: ownedRole.label,
      description: ownedRole.description,
      icon: 'IconKey',
      canUpdateAllSettings: false,
      canAccessAllTools: false,
      canReadAllObjectRecords: true,
      canUpdateAllObjectRecords: false,
      canSoftDeleteAllObjectRecords: false,
      canDestroyAllObjectRecords: false,
      canBeAssignedToUsers: false,
      canBeAssignedToAgents: false,
      canBeAssignedToApiKeys: true,
    };
    const operations = [];
    await deleteEphemeralDeploymentRole({
      role: ownedRole,
      graphql: async (request) => {
        operations.push(request);
        return request.operationName === 'VerifyCorgiCrmDeploymentRoleOwnership'
          ? { getRoles: [exactRole] }
          : { deleteOneRole: ownedRole.id };
      },
    });

    assert.deepEqual(
      operations.map(({ operationName }) => operationName),
      ['VerifyCorgiCrmDeploymentRoleOwnership', 'DeleteCorgiCrmDeploymentRole'],
    );
  });

  it('refuses to delete an ephemeral role when its ownership shape changed', async () => {
    const ownedRole = deploymentRoleIdentity({
      repository: 'Corgi-ETF/twenty',
      workspaceId,
      runId: '123',
      runAttempt: '1',
    });
    await assert.rejects(
      deleteEphemeralDeploymentRole({
        role: ownedRole,
        graphql: async () => ({
          getRoles: [
            {
              id: ownedRole.id,
              label: 'Foreign role',
              description: ownedRole.description,
            },
          ],
        }),
      }),
      /mismatched ownership/,
    );
  });
});
