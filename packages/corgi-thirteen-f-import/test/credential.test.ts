import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APPROVED_WORKSPACE_ID,
  APPROVED_WORKSPACE_NAME,
  THIRTEEN_F_APPLICATION_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_HOLDING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_ERROR_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_RUN_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_PENDING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_SECURITY_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_SOURCE_NODE_FIELD_UNIVERSAL_IDENTIFIER,
} from '../src/constants.ts';
import {
  cleanupImportCredential,
  createImportCredential,
  importRoleIdentity,
  type GraphqlRequest,
  type ImportCredentialLease,
} from '../src/credential.ts';

const objectMetadataId = 'b1fab26e-4e38-4a95-a653-3cdb014a6b28';
const normalizedObjectMetadataIds = [
  'a1fab26e-4e38-4a95-a653-3cdb014a6b28',
  'a2fab26e-4e38-4a95-a653-3cdb014a6b28',
  'a3fab26e-4e38-4a95-a653-3cdb014a6b28',
  'a4fab26e-4e38-4a95-a653-3cdb014a6b28',
  'a5fab26e-4e38-4a95-a653-3cdb014a6b28',
];
const objectMetadataIds = [objectMetadataId, ...normalizedObjectMetadataIds];
const apiKeyId = 'bc841975-9c6e-44d8-8bd7-8048312b7b0e';

const preflight = () => ({
  currentUser: {
    currentWorkspace: {
      id: APPROVED_WORKSPACE_ID,
      displayName: APPROVED_WORKSPACE_NAME,
    },
    currentUserWorkspace: {
      id: '8ac22e56-229d-4fd9-a1ad-d315755b0d3d',
      isImpersonating: false,
      permissionFlags: ['ROLES', 'API_KEYS_AND_WEBHOOKS'],
    },
  },
  findOneApplication: {
    universalIdentifier: THIRTEEN_F_APPLICATION_UNIVERSAL_IDENTIFIER,
    state: 'INSTALLED',
    objects: [
      {
        id: objectMetadataId,
        universalIdentifier: THIRTEEN_F_OBJECT_UNIVERSAL_IDENTIFIER,
        nameSingular: 'thirteenFFiling',
        namePlural: 'thirteenFFilings',
        fieldsList: [
          {
            universalIdentifier: THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
            name: 'file',
            type: 'FILES',
            isActive: true,
            isUnique: false,
          },
          {
            universalIdentifier:
              THIRTEEN_F_SOURCE_NODE_FIELD_UNIVERSAL_IDENTIFIER,
            name: 'sourceNodeId',
            type: 'TEXT',
            isActive: true,
            isUnique: true,
          },
          {
            universalIdentifier:
              THIRTEEN_F_PENDING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
            name: 'importPendingFileId',
            type: 'TEXT',
            isActive: true,
            isUnique: false,
          },
        ],
      },
      ...[
        [
          THIRTEEN_F_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
          'thirteenFManager',
          'thirteenFManagers',
        ],
        [
          THIRTEEN_F_SECURITY_OBJECT_UNIVERSAL_IDENTIFIER,
          'thirteenFSecurity',
          'thirteenFSecurities',
        ],
        [
          THIRTEEN_F_HOLDING_OBJECT_UNIVERSAL_IDENTIFIER,
          'thirteenFHolding',
          'thirteenFHoldings',
        ],
        [
          THIRTEEN_F_IMPORT_RUN_OBJECT_UNIVERSAL_IDENTIFIER,
          'thirteenFImportRun',
          'thirteenFImportRuns',
        ],
        [
          THIRTEEN_F_IMPORT_ERROR_OBJECT_UNIVERSAL_IDENTIFIER,
          'thirteenFImportError',
          'thirteenFImportErrors',
        ],
      ].map(([universalIdentifier, nameSingular, namePlural], index) => ({
        id: normalizedObjectMetadataIds[index],
        universalIdentifier,
        nameSingular,
        namePlural,
        fieldsList: [],
      })),
    ],
  },
});

test('derives a stable, run-owned role identity', () => {
  const input = {
    repository: 'Corgi-ETF/twenty',
    workspaceId: APPROVED_WORKSPACE_ID,
    runId: '12345',
    runAttempt: '2',
  };
  const first = importRoleIdentity(input);
  const second = importRoleIdentity(input);

  assert.deepEqual(first, second);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.equal(first.label, 'Corgi 13F import 12345-2');
  assert.match(first.description, /Corgi-ETF\/twenty/);
  assert.equal(first.ephemeral, true);
});

test('creates only exact read and normalized-object write permissions', async () => {
  const leases: ImportCredentialLease[] = [];
  const calls: GraphqlRequest[] = [];
  let roleId = '';
  const graphql = async (request: GraphqlRequest) => {
    calls.push(request);
    const variables = request.variables ?? {};
    if (request.operationName === 'CorgiThirteenFImportPreflight') {
      return preflight();
    }
    if (request.operationName === 'CreateCorgiThirteenFImportRole') {
      const input = variables.input as Record<string, unknown>;
      roleId = String(input.id);
      return { createOneRole: input };
    }
    if (request.operationName === 'ConfigureCorgiThirteenFImportFlag') {
      return { upsertPermissionFlags: [] };
    }
    if (request.operationName === 'ConfigureCorgiThirteenFObjectPermission') {
      return {
        upsertObjectPermissions: (
          variables.input as { objectPermissions: unknown[] }
        ).objectPermissions,
      };
    }
    if (request.operationName === 'VerifyCorgiThirteenFImportRole') {
      return {
        getRoles: [
          {
            id: roleId,
            label: `Corgi 13F import 12345-1`,
            description: `Ephemeral Corgi 13F import role owned by Corgi-ETF/twenty:${APPROVED_WORKSPACE_ID}:12345:1`,
            icon: 'IconKey',
            canUpdateAllSettings: false,
            canAccessAllTools: false,
            canReadAllObjectRecords: false,
            canUpdateAllObjectRecords: false,
            canSoftDeleteAllObjectRecords: false,
            canDestroyAllObjectRecords: false,
            canBeAssignedToUsers: false,
            canBeAssignedToAgents: false,
            canBeAssignedToApiKeys: true,
            permissionFlags: [],
            objectPermissions: objectMetadataIds.map(
              (permissionObjectMetadataId) => ({
                objectMetadataId: permissionObjectMetadataId,
                canReadObjectRecords: true,
                canUpdateObjectRecords:
                  permissionObjectMetadataId !== objectMetadataId,
                canSoftDeleteObjectRecords: false,
                canDestroyObjectRecords: false,
              }),
            ),
            fieldPermissions: [],
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        ],
      };
    }
    if (request.operationName === 'CreateCorgiThirteenFImportApiKey') {
      const input = variables.input as { name: string; expiresAt: string };
      return {
        createApiKey: {
          id: apiKeyId,
          name: input.name,
          expiresAt: input.expiresAt,
          revokedAt: null,
        },
      };
    }
    if (request.operationName === 'GenerateCorgiThirteenFImportToken') {
      return { generateApiKeyToken: { token: 'short-lived-token' } };
    }
    throw new Error(`unexpected operation ${request.operationName}`);
  };

  const lease = await createImportCredential({
    graphql,
    repository: 'Corgi-ETF/twenty',
    runId: '12345',
    runAttempt: '1',
    now: new Date('2026-11-09T18:00:00.000Z'),
    recordLease: async (value) => {
      leases.push(structuredClone(value));
    },
  });

  assert.equal(lease.token, 'short-lived-token');
  assert.deepEqual(leases[0]?.role.objectMetadataIds, objectMetadataIds);
  assert.equal(leases[leases.length - 1]?.token, 'short-lived-token');
  const flagCall = calls.find(
    ({ operationName }) =>
      operationName === 'ConfigureCorgiThirteenFImportFlag',
  );
  assert.deepEqual(flagCall?.variables, {
    input: { roleId, permissionFlagKeys: [] },
  });
  const permissionCall = calls.find(
    ({ operationName }) =>
      operationName === 'ConfigureCorgiThirteenFObjectPermission',
  );
  assert.deepEqual(permissionCall?.variables, {
    input: {
      roleId,
      objectPermissions: objectMetadataIds.map(
        (permissionObjectMetadataId) => ({
          objectMetadataId: permissionObjectMetadataId,
          canReadObjectRecords: true,
          canUpdateObjectRecords:
            permissionObjectMetadataId !== objectMetadataId,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        }),
      ),
    },
  });
});

test('fails before creating a role when the installed field contract is not exact', async () => {
  const value = preflight();
  value.findOneApplication.objects[0]!.fieldsList[1]!.isUnique = false;
  const operations: string[] = [];

  await assert.rejects(
    createImportCredential({
      graphql: async (request) => {
        operations.push(request.operationName);
        return value;
      },
      repository: 'Corgi-ETF/twenty',
      runId: '1',
      runAttempt: '1',
      recordLease: async () => undefined,
    }),
    /installed 13F contract is invalid/,
  );
  assert.deepEqual(operations, ['CorgiThirteenFImportPreflight']);
});

test('revokes and verifies the key before deleting only the run-owned role', async () => {
  const role = importRoleIdentity({
    repository: 'Corgi-ETF/twenty',
    workspaceId: APPROVED_WORKSPACE_ID,
    runId: '12345',
    runAttempt: '1',
  });
  role.objectMetadataIds = objectMetadataIds;
  const operations: string[] = [];
  let revoked = false;
  await cleanupImportCredential({
    lease: {
      role,
      id: apiKeyId,
      name: 'corgi-13f-import-12345-1',
      expiresAt: '2026-11-09T18:30:00.000Z',
      token: 'secret',
    },
    graphql: async (request) => {
      operations.push(request.operationName);
      if (request.operationName === 'ReadCorgiThirteenFImportApiKey') {
        return {
          apiKey: { id: apiKeyId, revokedAt: revoked ? '2026-11-09' : null },
        };
      }
      if (request.operationName === 'RevokeCorgiThirteenFImportApiKey') {
        revoked = true;
        return { revokeApiKey: { id: apiKeyId } };
      }
      if (request.operationName === 'VerifyCorgiThirteenFImportRoleOwnership') {
        return {
          getRoles: [
            {
              id: role.id,
              label: role.label,
              description: role.description,
              icon: 'IconKey',
              canBeAssignedToApiKeys: true,
            },
          ],
        };
      }
      if (request.operationName === 'DeleteCorgiThirteenFImportRole') {
        return { deleteOneRole: role.id };
      }
      throw new Error(`unexpected operation ${request.operationName}`);
    },
  });

  assert.deepEqual(operations, [
    'ReadCorgiThirteenFImportApiKey',
    'RevokeCorgiThirteenFImportApiKey',
    'ReadCorgiThirteenFImportApiKey',
    'VerifyCorgiThirteenFImportRoleOwnership',
    'DeleteCorgiThirteenFImportRole',
  ]);
});

test('recovers a created key by exact run-owned role when its create response was lost', async () => {
  const role = importRoleIdentity({
    repository: 'Corgi-ETF/twenty',
    workspaceId: APPROVED_WORKSPACE_ID,
    runId: '777',
    runAttempt: '1',
  });
  role.objectMetadataIds = objectMetadataIds;
  const lease: ImportCredentialLease = {
    role,
    name: 'corgi-13f-import-777-1',
    expiresAt: '2026-11-09T18:30:00.000Z',
  };
  const operations: string[] = [];
  let revoked = false;

  await cleanupImportCredential({
    lease,
    graphql: async (request) => {
      operations.push(request.operationName);
      if (request.operationName === 'FindCorgiThirteenFRunOwnedApiKey') {
        return {
          getRoles: [
            {
              id: role.id,
              apiKeys: [
                {
                  id: apiKeyId,
                  name: lease.name,
                  expiresAt: lease.expiresAt,
                  revokedAt: revoked ? '2026-11-09' : null,
                },
              ],
            },
          ],
        };
      }
      if (request.operationName === 'ReadCorgiThirteenFImportApiKey') {
        return {
          apiKey: { id: apiKeyId, revokedAt: revoked ? '2026-11-09' : null },
        };
      }
      if (request.operationName === 'RevokeCorgiThirteenFImportApiKey') {
        revoked = true;
        return { revokeApiKey: { id: apiKeyId } };
      }
      if (request.operationName === 'VerifyCorgiThirteenFImportRoleOwnership') {
        return {
          getRoles: [
            {
              id: role.id,
              label: role.label,
              description: role.description,
              icon: 'IconKey',
              canBeAssignedToApiKeys: true,
            },
          ],
        };
      }
      if (request.operationName === 'DeleteCorgiThirteenFImportRole') {
        return { deleteOneRole: role.id };
      }
      throw new Error(`unexpected operation ${request.operationName}`);
    },
  });

  assert.equal(operations[0], 'FindCorgiThirteenFRunOwnedApiKey');
  assert.equal(operations.includes('RevokeCorgiThirteenFImportApiKey'), true);
});
