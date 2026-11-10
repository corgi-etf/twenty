export type GraphqlRequest = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
};

export type GraphqlCaller = (
  request: GraphqlRequest,
) => Promise<Record<string, unknown>>;

export type ImportRoleLease = {
  id: string;
  label: string;
  description: string;
  objectMetadataIds?: string[];
  fieldRestrictions?: ImportFieldRestriction[];
  ephemeral: true;
};

export type ImportFieldRestriction = {
  objectMetadataId: string;
  fieldMetadataId: string;
  canReadFieldValue: false;
  canUpdateFieldValue: false;
};

export type ImportCredentialLease = {
  role: ImportRoleLease;
  id?: string;
  name?: string;
  expiresAt?: string;
  token?: string;
};

export type CreateImportCredentialOptions = {
  graphql: GraphqlCaller;
  repository: string;
  runId: string;
  runAttempt: string;
  now?: Date;
  recordLease(lease: ImportCredentialLease): Promise<void>;
};

export const importRoleIdentity = (_input: {
  repository: string;
  workspaceId: string;
  runId: string;
  runAttempt: string;
}): ImportRoleLease => {
  const input = _input;
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository) ||
    !UUID_PATTERN.test(input.workspaceId) ||
    !/^[1-9][0-9]*$/.test(input.runId) ||
    !/^[1-9][0-9]*$/.test(input.runAttempt)
  ) {
    throw new Error('Import role identity inputs are invalid');
  }
  const ownershipKey = `${input.repository}:${input.workspaceId}:${input.runId}:${input.runAttempt}`;
  const bytes = Buffer.from(
    createHash('sha256').update(ownershipKey).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    label: `Corgi 13F import ${input.runId}-${input.runAttempt}`,
    description: `Ephemeral Corgi 13F import role owned by ${ownershipKey}`,
    ephemeral: true,
  };
};

export const createImportCredential = async (
  options: CreateImportCredentialOptions,
): Promise<Required<ImportCredentialLease>> => {
  const { objectMetadataIds, fieldRestrictions } = await preflight(
    options.graphql,
  );
  const role: ImportRoleLease = {
    ...importRoleIdentity({
      repository: options.repository,
      workspaceId: APPROVED_WORKSPACE_ID,
      runId: options.runId,
      runAttempt: options.runAttempt,
    }),
    objectMetadataIds,
    fieldRestrictions,
  };
  await options.recordLease({ role });
  const roleInput = exactRoleInput(role);
  const createdRole = await options.graphql({
    operationName: 'CreateCorgiThirteenFImportRole',
    query: `mutation CreateCorgiThirteenFImportRole($input: CreateRoleInput!) {
      createOneRole(createRoleInput: $input) {
        id label description icon canUpdateAllSettings canAccessAllTools
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
      }
    }`,
    variables: { input: roleInput },
  });
  if (!matchesRecord(createdRole.createOneRole, roleInput)) {
    throw new Error('Server did not create the exact 13F import role');
  }
  const objectPermissions = objectMetadataIds.map((objectMetadataId) =>
    exactObjectPermission(objectMetadataId),
  );
  const configuredPermission = await options.graphql({
    operationName: 'ConfigureCorgiThirteenFObjectPermission',
    query: `mutation ConfigureCorgiThirteenFObjectPermission(
      $input: UpsertObjectPermissionsInput!
    ) {
      upsertObjectPermissions(upsertObjectPermissionsInput: $input) {
        objectMetadataId canReadObjectRecords canUpdateObjectRecords
        canSoftDeleteObjectRecords canDestroyObjectRecords
      }
    }`,
    variables: {
      input: { roleId: role.id, objectPermissions },
    },
  });
  if (
    !Array.isArray(configuredPermission.upsertObjectPermissions) ||
    configuredPermission.upsertObjectPermissions.length !==
      objectPermissions.length ||
    !objectPermissions.every((permission) =>
      asRecords(configuredPermission.upsertObjectPermissions).some(
        (configured) => matchesRecord(configured, permission),
      ),
    )
  ) {
    throw new Error('Server did not configure the exact object permission');
  }
  if (fieldRestrictions.length > 0) {
    const configuredFields = await options.graphql({
      operationName: 'ConfigureCorgiThirteenFFieldPermission',
      query: `mutation ConfigureCorgiThirteenFFieldPermission(
        $input: UpsertFieldPermissionsInput!
      ) {
        upsertFieldPermissions(upsertFieldPermissionsInput: $input) {
          objectMetadataId fieldMetadataId canReadFieldValue canUpdateFieldValue
        }
      }`,
      variables: {
        input: { roleId: role.id, fieldPermissions: fieldRestrictions },
      },
    });
    if (
      !Array.isArray(configuredFields.upsertFieldPermissions) ||
      configuredFields.upsertFieldPermissions.length !==
        fieldRestrictions.length ||
      !fieldRestrictions.every((restriction) =>
        asRecords(configuredFields.upsertFieldPermissions).some((configured) =>
          matchesRecord(configured, restriction),
        ),
      )
    ) {
      throw new Error('Server did not configure the exact field restrictions');
    }
  }
  await verifyExactRole(options.graphql, role);

  const name = `corgi-13f-import-${options.runId}-${options.runAttempt}`;
  const expiresAt = new Date(
    (options.now ?? new Date()).getTime() + 30 * 60 * 1000,
  ).toISOString();
  await options.recordLease({ role, name, expiresAt });
  let key: Record<string, unknown> | undefined;
  try {
    const createdKey = await options.graphql({
      operationName: 'CreateCorgiThirteenFImportApiKey',
      query: `mutation CreateCorgiThirteenFImportApiKey(
        $input: CreateApiKeyInput!
      ) {
        createApiKey(input: $input) { id name expiresAt revokedAt }
      }`,
      variables: { input: { name, expiresAt, roleId: role.id } },
    });
    key = isRecord(createdKey.createApiKey)
      ? createdKey.createApiKey
      : undefined;
  } catch {
    key = await findRunOwnedApiKey(options.graphql, {
      role,
      name,
      expiresAt,
    });
  }
  if (!isExactApiKey(key, name, expiresAt)) {
    key = await findRunOwnedApiKey(options.graphql, {
      role,
      name,
      expiresAt,
    });
  }
  if (!isExactApiKey(key, name, expiresAt)) {
    throw new Error('Server did not create the exact 13F import API key');
  }
  const lease: ImportCredentialLease = {
    role,
    id: key.id,
    name,
    expiresAt,
  };
  await options.recordLease(lease);
  const generated = await options.graphql({
    operationName: 'GenerateCorgiThirteenFImportToken',
    query: `mutation GenerateCorgiThirteenFImportToken(
      $apiKeyId: UUID!
      $expiresAt: String!
    ) {
      generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) {
        token
      }
    }`,
    variables: { apiKeyId: key.id, expiresAt },
  });
  const generatedToken = isRecord(generated.generateApiKeyToken)
    ? generated.generateApiKeyToken.token
    : undefined;
  if (typeof generatedToken !== 'string' || !generatedToken.trim()) {
    throw new Error('Server did not generate the 13F import API key token');
  }
  const completeLease = {
    ...lease,
    token: generatedToken.trim(),
  } as Required<ImportCredentialLease>;
  await options.recordLease(completeLease);

  return completeLease;
};

export const cleanupImportCredential = async (options: {
  graphql: GraphqlCaller;
  lease: ImportCredentialLease;
}): Promise<void> => {
  let apiKeyId = options.lease.id?.trim();
  if (
    !apiKeyId &&
    options.lease.name?.trim() &&
    options.lease.expiresAt?.trim()
  ) {
    const recovered = await findRunOwnedApiKey(options.graphql, options.lease);
    apiKeyId =
      recovered && typeof recovered.id === 'string' ? recovered.id : undefined;
  }
  if (apiKeyId) {
    if (!UUID_PATTERN.test(apiKeyId)) {
      throw new Error('Refusing to clean up an invalid 13F import API key');
    }
    const current = await readApiKey(options.graphql, apiKeyId);
    if (current && !current.revokedAt) {
      const revoked = await options.graphql({
        operationName: 'RevokeCorgiThirteenFImportApiKey',
        query: `mutation RevokeCorgiThirteenFImportApiKey(
          $input: RevokeApiKeyInput!
        ) {
          revokeApiKey(input: $input) { id }
        }`,
        variables: { input: { id: apiKeyId } },
      });
      if (
        !isRecord(revoked.revokeApiKey) ||
        revoked.revokeApiKey.id !== apiKeyId
      ) {
        throw new Error('Server did not revoke the 13F import API key');
      }
    }
    const verified = await readApiKey(options.graphql, apiKeyId);
    if (!verified || typeof verified.revokedAt !== 'string') {
      throw new Error('13F import API key revocation could not be verified');
    }
  }

  const role = options.lease.role;
  if (!role?.ephemeral || !UUID_PATTERN.test(role.id)) {
    throw new Error('Refusing to clean up an invalid 13F import role');
  }
  const roles = await options.graphql({
    operationName: 'VerifyCorgiThirteenFImportRoleOwnership',
    query: `query VerifyCorgiThirteenFImportRoleOwnership {
      getRoles {
        id label description icon canBeAssignedToApiKeys
      }
    }`,
  });
  const matches = asRecords(roles.getRoles).filter(({ id }) => id === role.id);
  if (matches.length === 0) return;
  if (
    matches.length !== 1 ||
    matches[0]?.label !== role.label ||
    matches[0]?.description !== role.description ||
    matches[0]?.icon !== 'IconKey' ||
    matches[0]?.canBeAssignedToApiKeys !== true
  ) {
    throw new Error('Refusing to delete a role with mismatched ownership');
  }
  const deleted = await options.graphql({
    operationName: 'DeleteCorgiThirteenFImportRole',
    query: `mutation DeleteCorgiThirteenFImportRole($roleId: UUID!) {
      deleteOneRole(roleId: $roleId)
    }`,
    variables: { roleId: role.id },
  });
  if (deleted.deleteOneRole !== role.id) {
    throw new Error('Server did not delete the exact 13F import role');
  }
};
import { createHash } from 'node:crypto';

import {
  APPROVED_WORKSPACE_ID,
  APPROVED_WORKSPACE_NAME,
  THIRTEEN_F_APPLICATION_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_HOLDING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_SECURITY_OBJECT_UNIVERSAL_IDENTIFIER,
} from './constants.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_HUMAN_FLAGS = ['API_KEYS_AND_WEBHOOKS', 'ROLES'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const matchesRecord = (
  value: unknown,
  expected: Record<string, unknown>,
): boolean =>
  isRecord(value) &&
  Object.entries(expected).every(([key, expectedValue]) =>
    Object.is(value[key], expectedValue),
  );

const exactRoleInput = (role: ImportRoleLease): Record<string, unknown> => ({
  id: role.id,
  label: role.label,
  description: role.description,
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
});

const exactObjectPermission = (
  objectMetadataId: string,
): Record<string, unknown> => ({
  objectMetadataId,
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const exactFieldRestriction = (
  value: Pick<ImportFieldRestriction, 'objectMetadataId' | 'fieldMetadataId'>,
): ImportFieldRestriction => ({
  ...value,
  canReadFieldValue: false,
  canUpdateFieldValue: false,
});

const hasNoPermissionFlags = (value: unknown): boolean =>
  asRecords(value).length === 0;

const preflight = async (
  graphql: GraphqlCaller,
): Promise<{
  objectMetadataIds: string[];
  fieldRestrictions: ImportFieldRestriction[];
}> => {
  const data = await graphql({
    operationName: 'CorgiThirteenFImportPreflight',
    query: `query CorgiThirteenFImportPreflight($applicationId: UUID!) {
      currentUser {
        currentWorkspace { id displayName }
        currentUserWorkspace { id permissionFlags isImpersonating }
      }
      findOneApplication(universalIdentifier: $applicationId) {
        universalIdentifier state
        objects {
          id universalIdentifier nameSingular namePlural
          fieldsList { universalIdentifier name type isActive isUnique }
        }
      }
      objects(paging: { first: 1000 }) {
        edges {
          node {
            id nameSingular namePlural
            fieldsList { id name isActive }
          }
        }
        pageInfo { hasNextPage }
      }
    }`,
    variables: {
      applicationId: THIRTEEN_F_APPLICATION_UNIVERSAL_IDENTIFIER,
    },
  });
  const user = isRecord(data.currentUser) ? data.currentUser : null;
  const workspace =
    user && isRecord(user.currentWorkspace) ? user.currentWorkspace : null;
  const membership =
    user && isRecord(user.currentUserWorkspace)
      ? user.currentUserWorkspace
      : null;
  const humanFlags = Array.isArray(membership?.permissionFlags)
    ? membership.permissionFlags
    : [];
  if (
    workspace?.id !== APPROVED_WORKSPACE_ID ||
    workspace.displayName !== APPROVED_WORKSPACE_NAME ||
    membership?.isImpersonating === true ||
    !REQUIRED_HUMAN_FLAGS.every((flag) => humanFlags.includes(flag))
  ) {
    throw new Error('13F import session is not the approved tenant admin');
  }
  const application = isRecord(data.findOneApplication)
    ? data.findOneApplication
    : null;
  const objects = application ? asRecords(application.objects) : [];
  const expectedObjects = [
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
  ] as const;
  const matchedObjects = expectedObjects.map(
    ([universalIdentifier, nameSingular, namePlural]) => {
      const matches = objects.filter(
        (candidate) => candidate.universalIdentifier === universalIdentifier,
      );
      const candidate = matches[0];
      if (
        matches.length !== 1 ||
        typeof candidate?.id !== 'string' ||
        !UUID_PATTERN.test(candidate.id) ||
        candidate.nameSingular !== nameSingular ||
        candidate.namePlural !== namePlural
      ) {
        throw new Error('The installed 13F contract is invalid');
      }

      return candidate;
    },
  );
  if (
    application?.universalIdentifier !==
      THIRTEEN_F_APPLICATION_UNIVERSAL_IDENTIFIER ||
    application.state !== 'INSTALLED'
  ) {
    throw new Error('The installed 13F contract is invalid');
  }
  const objectConnection = isRecord(data.objects) ? data.objects : null;
  const companyMatches = asRecords(objectConnection?.edges)
    .map((edge) => (isRecord(edge.node) ? edge.node : null))
    .filter(
      (node): node is Record<string, unknown> =>
        node !== null && node.nameSingular === 'company',
    );
  const company = companyMatches[0];
  if (
    companyMatches.length !== 1 ||
    objectConnection?.pageInfo === undefined ||
    !isRecord(objectConnection.pageInfo) ||
    objectConnection.pageInfo.hasNextPage === true ||
    typeof company?.id !== 'string' ||
    !UUID_PATTERN.test(company.id) ||
    company.namePlural !== 'companies'
  ) {
    throw new Error('The Company read contract is invalid');
  }
  const fields = asRecords(company.fieldsList);
  const allowedFields = ['id', 'name'];
  for (const fieldName of allowedFields) {
    const matches = fields.filter(
      ({ name, isActive }) => name === fieldName && isActive === true,
    );
    if (
      matches.length !== 1 ||
      typeof matches[0]?.id !== 'string' ||
      !UUID_PATTERN.test(matches[0].id)
    ) {
      throw new Error('The Company read contract is invalid');
    }
  }
  const restrictedFields = fields.filter(
    ({ name, isActive }) =>
      isActive === true &&
      typeof name === 'string' &&
      !allowedFields.includes(name),
  );
  if (
    fields.some(
      ({ id, name, isActive }) =>
        typeof id !== 'string' ||
        !UUID_PATTERN.test(id) ||
        typeof name !== 'string' ||
        typeof isActive !== 'boolean',
    ) ||
    restrictedFields.length !==
      fields.filter(({ isActive }) => isActive).length - 2
  ) {
    throw new Error('The Company read contract is invalid');
  }
  const fieldRestrictions = restrictedFields.map(({ id }) =>
    exactFieldRestriction({
      objectMetadataId: String(company.id),
      fieldMetadataId: String(id),
    }),
  );

  return {
    objectMetadataIds: [
      ...matchedObjects.map(({ id }) => String(id)),
      company.id,
    ],
    fieldRestrictions,
  };
};

const verifyExactRole = async (
  graphql: GraphqlCaller,
  role: ImportRoleLease,
): Promise<void> => {
  const data = await graphql({
    operationName: 'VerifyCorgiThirteenFImportRole',
    query: `query VerifyCorgiThirteenFImportRole {
      getRoles {
        id label description icon canUpdateAllSettings canAccessAllTools
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
        permissionFlags { roleId flag }
        objectPermissions {
          objectMetadataId canReadObjectRecords canUpdateObjectRecords
          canSoftDeleteObjectRecords canDestroyObjectRecords
        }
        fieldPermissions { id }
        rowLevelPermissionPredicates { id }
        rowLevelPermissionPredicateGroups { id }
      }
    }`,
  });
  const matches = asRecords(data.getRoles).filter(({ id }) => id === role.id);
  const found = matches[0];
  if (
    matches.length !== 1 ||
    !matchesRecord(found, exactRoleInput(role)) ||
    !hasNoPermissionFlags(found?.permissionFlags) ||
    asRecords(found?.objectPermissions).length !==
      (role.objectMetadataIds?.length ?? 0) ||
    !(role.objectMetadataIds ?? []).every((objectMetadataId) =>
      asRecords(found?.objectPermissions).some((permission) =>
        matchesRecord(permission, exactObjectPermission(objectMetadataId)),
      ),
    ) ||
    asRecords(found?.fieldPermissions).length !==
      (role.fieldRestrictions?.length ?? 0) ||
    !(role.fieldRestrictions ?? []).every((restriction) =>
      asRecords(found?.fieldPermissions).some((permission) =>
        matchesRecord(permission, restriction),
      ),
    ) ||
    asRecords(found?.rowLevelPermissionPredicates).length !== 0 ||
    asRecords(found?.rowLevelPermissionPredicateGroups).length !== 0
  ) {
    throw new Error('13F import role is broader than the exact capability set');
  }
};

const readApiKey = async (
  graphql: GraphqlCaller,
  apiKeyId: string,
): Promise<Record<string, unknown> | undefined> => {
  const data = await graphql({
    operationName: 'ReadCorgiThirteenFImportApiKey',
    query: `query ReadCorgiThirteenFImportApiKey($input: GetApiKeyInput!) {
      apiKey(input: $input) { id revokedAt }
    }`,
    variables: { input: { id: apiKeyId } },
  });
  if (data.apiKey === null || data.apiKey === undefined) return undefined;
  if (!isRecord(data.apiKey) || data.apiKey.id !== apiKeyId) {
    throw new Error('13F import API key response is invalid');
  }

  return data.apiKey;
};

const isExactApiKey = (
  value: unknown,
  name: string,
  expiresAt: string,
): value is Record<string, unknown> & {
  id: string;
  name: string;
  expiresAt: string;
} =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  UUID_PATTERN.test(value.id) &&
  value.name === name &&
  value.expiresAt === expiresAt &&
  !value.revokedAt;

const findRunOwnedApiKey = async (
  graphql: GraphqlCaller,
  lease: ImportCredentialLease,
): Promise<Record<string, unknown> | undefined> => {
  const name = lease.name?.trim();
  const expiresAt = lease.expiresAt?.trim();
  if (!name || !expiresAt || !lease.role?.id) return undefined;
  const data = await graphql({
    operationName: 'FindCorgiThirteenFRunOwnedApiKey',
    query: `query FindCorgiThirteenFRunOwnedApiKey {
      getRoles { id apiKeys { id name expiresAt revokedAt } }
    }`,
  });
  const roles = asRecords(data.getRoles).filter(
    ({ id }) => id === lease.role.id,
  );
  if (roles.length !== 1) return undefined;
  const keys = asRecords(roles[0]?.apiKeys).filter(
    (key) => key.name === name && key.expiresAt === expiresAt,
  );
  if (keys.length > 1) {
    throw new Error('Multiple run-owned 13F import API keys were found');
  }

  return keys[0];
};
