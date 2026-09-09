const REQUIRED_PERMISSION_FLAGS = [
  'API_KEYS_AND_WEBHOOKS',
  'APPLICATIONS',
  'MARKETPLACE_APPS',
  'ROLES',
];
const KEY_LIFETIME_MILLISECONDS = 30 * 60 * 1000;

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
        canUpdateAllSettings
        canReadAllObjectRecords
        canUpdateAllObjectRecords
        canBeAssignedToApiKeys
        permissionFlags { flag }
        workspaceMembers { userWorkspaceId }
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
    throw new Error('Deployment session is not the approved non-impersonated tenant membership');
  }
  if (
    !REQUIRED_PERMISSION_FLAGS.every((flag) =>
      membership.permissionFlags?.includes(flag),
    )
  ) {
    throw new Error('Deployment session lacks required settings permissions');
  }

  const assignedRoles = (data.getRoles ?? []).filter((role) =>
    role.workspaceMembers?.some(
      ({ userWorkspaceId }) => userWorkspaceId === expectedUserWorkspaceId,
    ),
  );
  const role = assignedRoles[0];
  const roleFlags = new Set(
    (role?.permissionFlags ?? []).map(({ flag }) => flag),
  );
  if (
    assignedRoles.length !== 1 ||
    role?.canUpdateAllSettings !== true ||
    role.canReadAllObjectRecords !== true ||
    role.canUpdateAllObjectRecords !== true ||
    role.canBeAssignedToApiKeys !== true ||
    !REQUIRED_PERMISSION_FLAGS.every((flag) => roleFlags.has(flag))
  ) {
    throw new Error('Deployment membership does not have one assignable administrator role');
  }
  return role.id;
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
  runId,
  runAttempt,
  now = new Date(),
}) => {
  const roleId = await assertExactTenantAndSelectRole({
    graphql,
    expectedWorkspaceId,
    expectedUserWorkspaceId,
  });
  const name = deploymentKeyName({ runId, runAttempt });
  const expiresAt = new Date(
    now.getTime() + KEY_LIFETIME_MILLISECONDS,
  ).toISOString();
  const data = await graphql({
    operationName: 'CreateCorgiCrmDeploymentApiKey',
    query: `mutation CreateCorgiCrmDeploymentApiKey($input: CreateApiKeyInput!) {
      createApiKey(input: $input) { id name expiresAt revokedAt }
    }`,
    variables: { input: { name, expiresAt, roleId } },
  });
  const key = data.createApiKey;
  if (
    !key?.id ||
    key.name !== name ||
    key.expiresAt !== expiresAt ||
    key.revokedAt
  ) {
    throw new Error('Server did not create the exact short-lived deployment API key');
  }
  return { id: key.id, name, expiresAt };
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
  if (!token) throw new Error('Server did not return a deployment API key token');
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

export {
  createDeploymentApiKey,
  deploymentKeyName,
  generateDeploymentApiKeyToken,
  revokeDeploymentApiKey,
};
