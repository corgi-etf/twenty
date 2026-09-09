import {
  CANONICALIZATION_APPROVED_ORIGIN,
  type CanonicalizationRequestContext,
} from './twenty-rest-api.ts';
import type { createCanonicalizationRequestGate } from './request-gate.ts';

type TenantResponse = {
  data?: {
    currentUser?: {
      currentWorkspace?: { id?: unknown; displayName?: unknown } | null;
      currentUserWorkspace?: {
        id?: unknown;
        permissionFlags?: unknown;
        isImpersonating?: unknown;
      } | null;
    } | null;
    getRoles?: Array<{
      canUpdateAllSettings?: unknown;
      canReadAllObjectRecords?: unknown;
      canUpdateAllObjectRecords?: unknown;
      workspaceMembers?: Array<{ userWorkspaceId?: unknown }> | null;
    }>;
  };
  errors?: unknown;
};

const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const CANONICALIZATION_APPROVED_WORKSPACE_ID =
  'eabf5d9d-fc99-4acb-b160-710ecb1db996';
export const CANONICALIZATION_APPROVED_USER_WORKSPACE_ID =
  '767771e9-834d-4a89-88ca-1df32d101a40';

export const assertCanonicalizationTenant = async ({
  request,
  requestGate,
  origin,
  expectedWorkspaceId,
}: {
  request: CanonicalizationRequestContext;
  requestGate: ReturnType<typeof createCanonicalizationRequestGate>;
  origin: string;
  expectedWorkspaceId: string;
}): Promise<void> => {
  if (origin !== CANONICALIZATION_APPROVED_ORIGIN) {
    throw new Error('Canonicalization tenant origin is not approved');
  }
  if (
    !WORKSPACE_ID_PATTERN.test(expectedWorkspaceId) ||
    expectedWorkspaceId !== CANONICALIZATION_APPROVED_WORKSPACE_ID
  ) {
    throw new Error('Expected canonicalization workspace ID is invalid');
  }
  const response = await requestGate(() =>
    request.post(new URL('/metadata', origin).toString(), {
      headers: { Origin: origin },
      data: {
        operationName: 'CanonicalizationTenantPreflight',
        query: `query CanonicalizationTenantPreflight {
          currentUser {
            currentWorkspace { id displayName }
            currentUserWorkspace { id permissionFlags isImpersonating }
          }
          getRoles {
            canUpdateAllSettings
            canReadAllObjectRecords
            canUpdateAllObjectRecords
            workspaceMembers { userWorkspaceId }
          }
        }`,
      },
    }),
  );
  let body: TenantResponse;
  try {
    if (!response.ok()) {
      throw new Error(
        `Canonicalization tenant preflight failed with HTTP ${response.status()}`,
      );
    }
    try {
      body = (await response.json()) as TenantResponse;
    } catch {
      throw new Error(
        'Canonicalization tenant preflight response was not valid JSON',
      );
    }
  } finally {
    await response.dispose();
  }

  const user = body.data?.currentUser;
  const workspace = user?.currentWorkspace;
  const membership = user?.currentUserWorkspace;
  if (
    (Array.isArray(body.errors) ? body.errors.length > 0 : !!body.errors) ||
    workspace?.id !== expectedWorkspaceId ||
    workspace.displayName !== 'Corgi ETF'
  ) {
    throw new Error('Authenticated canonicalization workspace is not approved');
  }
  if (
    membership?.id !== CANONICALIZATION_APPROVED_USER_WORKSPACE_ID ||
    !Array.isArray(membership?.permissionFlags) ||
    !membership.permissionFlags.includes('DATA_MODEL') ||
    membership.isImpersonating === true
  ) {
    throw new Error(
      'Authenticated canonicalization session lacks metadata permission',
    );
  }
  const assignedRoles = (body.data?.getRoles ?? []).filter((role) =>
    role.workspaceMembers?.some(
      ({ userWorkspaceId }) => userWorkspaceId === membership.id,
    ),
  );
  if (
    assignedRoles.length !== 1 ||
    assignedRoles[0]?.canUpdateAllSettings !== true ||
    assignedRoles[0]?.canReadAllObjectRecords !== true ||
    assignedRoles[0]?.canUpdateAllObjectRecords !== true
  ) {
    throw new Error('Authenticated canonicalization session is not an admin');
  }
};
