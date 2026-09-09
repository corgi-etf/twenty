import { createHash } from 'node:crypto';

const REQUIRED_PERMISSION_FLAGS = [
  'API_KEYS_AND_WEBHOOKS',
  'APPLICATIONS',
  'MARKETPLACE_APPS',
  'ROLES',
];

const KEY_LIFETIME_MILLISECONDS = 30 * 60 * 1000;

const deploymentRoleIdentity = ({
  repository,
  workspaceId,
  runId,
  runAttempt,
}) => {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^[0-9a-f-]{36}$/i.test(workspaceId) ||
    !/^\d+$/.test(runId) ||
    !/^\d+$/.test(runAttempt)
  ) {
    throw new Error('Deployment role identity inputs are invalid');
  }
  const ownershipKey = `${repository}:${workspaceId}:${runId}:${runAttempt}`;
  const bytes = Buffer.from(
    createHash('sha256').update(ownershipKey, 'utf8').digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const label = `Corgi CRM deploy ${runId}-${runAttempt}`;
  const description = `Ephemeral Corgi CRM deployment role owned by ${ownershipKey}`;

  return { id, label, description, ephemeral: true };
};

const exactDeploymentRoleInput = (role) => ({
  id: role.id,
  label: role.label,
  description: role.description,
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
});

const assertExactTenantAndSelectRole = async ({
  graphql,
  expectedWorkspaceId,
  expectedUserWorkspaceId,
}) => {
  const data = await graphql({
    operationName: 'CorgiCrmDeploymentCredentialPreflight',
    query: `query CorgiCrmDeploymentCredentialPreflight {
      currentUser {
        currentWorkspace { id }
        currentUserWorkspace { id permissionFlags isImpersonating }
      }
      getRoles {
        id
        canReadAllObjectRecords
        canBeAssignedToApiKeys
        permissionFlags { flag }
      }
    }`,
  });
  const user = data.currentUser;
  const membership = user?.currentUserWorkspace;
  if (
    user?.currentWorkspace?.id !== expectedWorkspaceId ||
    membership?.id !== expectedUserWorkspaceId ||
    membership.isImpersonating === true
  ) {
    throw new Error(
      'Deployment session is not the approved non-impersonated tenant membership',
    );
  }
  if (
    !REQUIRED_PERMISSION_FLAGS.every((flag) =>
      membership.permissionFlags?.includes(flag),
    )
  ) {
    throw new Error('Deployment session lacks required settings permissions');
  }

  const candidateRoles = (data.getRoles ?? []).filter((role) => {
    const roleFlags = new Set(
      (role.permissionFlags ?? []).map(({ flag }) => flag),
    );
    return (
      role.canBeAssignedToApiKeys === true &&
      role.canReadAllObjectRecords === true &&
      REQUIRED_PERMISSION_FLAGS.every((flag) => roleFlags.has(flag))
    );
  });
  if (candidateRoles.length > 1) {
    throw new Error(
      `Expected one API-key-assignable deployment role, found ${candidateRoles.length}`,
    );
  }
  return candidateRoles[0];
};

const createEphemeralDeploymentRole = async ({ graphql, role }) => {
  const input = exactDeploymentRoleInput(role);
  const created = await graphql({
    operationName: 'CreateCorgiCrmDeploymentRole',
    query: `mutation CreateCorgiCrmDeploymentRole($input: CreateRoleInput!) {
      createOneRole(createRoleInput: $input) {
        id label description icon canUpdateAllSettings canAccessAllTools
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
      }
    }`,
    variables: { input },
  });
  const returned = created.createOneRole;
  if (
    !returned ||
    Object.entries(input).some(([key, value]) => returned[key] !== value)
  ) {
    throw new Error(
      'Server did not create the exact ephemeral deployment role',
    );
  }

  const configured = await graphql({
    operationName: 'ConfigureCorgiCrmDeploymentRole',
    query: `mutation ConfigureCorgiCrmDeploymentRole(
      $input: UpsertPermissionFlagsInput!
    ) {
      upsertPermissionFlags(upsertPermissionFlagsInput: $input) {
        id roleId flag
      }
    }`,
    variables: {
      input: { roleId: role.id, permissionFlagKeys: REQUIRED_PERMISSION_FLAGS },
    },
  });
  const returnedFlags = configured.upsertPermissionFlags ?? [];
  if (
    returnedFlags.some(({ roleId }) => roleId !== role.id) ||
    JSON.stringify(returnedFlags.map(({ flag }) => flag).sort()) !==
      JSON.stringify([...REQUIRED_PERMISSION_FLAGS].sort())
  ) {
    throw new Error('Server did not configure the exact deployment role flags');
  }
};

const deploymentKeyName = ({ runId, runAttempt }) => {
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) {
    throw new Error('GitHub run ID and attempt must be numeric');
  }
  return `corgi-crm-deploy-${runId}-${runAttempt}`;
};

const createDeploymentApiKey = async ({
  graphql,
  expectedWorkspaceId,
  expectedUserWorkspaceId,
  repository,
  runId,
  runAttempt,
  now = new Date(),
  recordLease = async () => undefined,
}) => {
  const selectedRole = await assertExactTenantAndSelectRole({
    graphql,
    expectedWorkspaceId,
    expectedUserWorkspaceId,
  });
  const role = selectedRole
    ? { id: selectedRole.id, ephemeral: false }
    : deploymentRoleIdentity({
        repository,
        workspaceId: expectedWorkspaceId,
        runId,
        runAttempt,
      });
  await recordLease({ role });
  if (role.ephemeral) {
    await createEphemeralDeploymentRole({ graphql, role });
  }
  const name = deploymentKeyName({ runId, runAttempt });
  const expiresAt = new Date(
    now.getTime() + KEY_LIFETIME_MILLISECONDS,
  ).toISOString();
  const data = await graphql({
    operationName: 'CreateCorgiCrmDeploymentApiKey',
    query: `mutation CreateCorgiCrmDeploymentApiKey($input: CreateApiKeyInput!) {
      createApiKey(input: $input) { id name expiresAt revokedAt }
    }`,
    variables: { input: { name, expiresAt, roleId: role.id } },
  });
  const key = data.createApiKey;
  if (
    !key?.id ||
    key.name !== name ||
    key.expiresAt !== expiresAt ||
    key.revokedAt
  ) {
    throw new Error(
      'Server did not create the exact short-lived deployment API key',
    );
  }
  const result = { id: key.id, name, expiresAt, role };
  await recordLease(result);
  return result;
};

const generateDeploymentApiKeyToken = async ({ graphql, key }) => {
  const data = await graphql({
    operationName: 'GenerateCorgiCrmDeploymentApiKeyToken',
    query: `mutation GenerateCorgiCrmDeploymentApiKeyToken(
      $apiKeyId: UUID!
      $expiresAt: String!
    ) {
      generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) { token }
    }`,
    variables: { apiKeyId: key.id, expiresAt: key.expiresAt },
  });
  const token = data.generateApiKeyToken?.token?.trim();
  if (!token)
    throw new Error('Server did not return a deployment API key token');
  return token;
};

const revokeDeploymentApiKey = async ({ graphql, apiKeyId }) => {
  const revoked = await graphql({
    operationName: 'RevokeCorgiCrmDeploymentApiKey',
    query: `mutation RevokeCorgiCrmDeploymentApiKey($input: RevokeApiKeyInput!) {
      revokeApiKey(input: $input) { id }
    }`,
    variables: { input: { id: apiKeyId } },
  });
  if (revoked.revokeApiKey?.id !== apiKeyId) {
    throw new Error('Server did not revoke the deployment API key');
  }

  const verified = await graphql({
    operationName: 'VerifyCorgiCrmDeploymentApiKeyRevoked',
    query: `query VerifyCorgiCrmDeploymentApiKeyRevoked($input: GetApiKeyInput!) {
      apiKey(input: $input) { id revokedAt }
    }`,
    variables: { input: { id: apiKeyId } },
  });
  if (
    verified.apiKey?.id !== apiKeyId ||
    typeof verified.apiKey.revokedAt !== 'string'
  ) {
    throw new Error('Deployment API key revocation could not be verified');
  }
};

const deleteEphemeralDeploymentRole = async ({ graphql, role }) => {
  if (!role?.ephemeral) return;
  const data = await graphql({
    operationName: 'VerifyCorgiCrmDeploymentRoleOwnership',
    query: `query VerifyCorgiCrmDeploymentRoleOwnership {
      getRoles {
        id label description icon canUpdateAllSettings canAccessAllTools
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
      }
    }`,
  });
  const found = (data.getRoles ?? []).find(({ id }) => id === role.id);
  if (!found) return;
  const expected = exactDeploymentRoleInput(role);
  if (Object.entries(expected).some(([key, value]) => found[key] !== value)) {
    throw new Error(
      'Refusing to delete a deployment role with mismatched ownership',
    );
  }
  const deleted = await graphql({
    operationName: 'DeleteCorgiCrmDeploymentRole',
    query: `mutation DeleteCorgiCrmDeploymentRole($roleId: UUID!) {
      deleteOneRole(roleId: $roleId)
    }`,
    variables: { roleId: role.id },
  });
  if (deleted.deleteOneRole !== role.id) {
    throw new Error(
      'Server did not delete the exact ephemeral deployment role',
    );
  }
};

export {
  createDeploymentApiKey,
  deleteEphemeralDeploymentRole,
  deploymentRoleIdentity,
  deploymentKeyName,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
};
