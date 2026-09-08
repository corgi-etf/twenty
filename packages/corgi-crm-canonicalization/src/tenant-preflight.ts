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
        permissionFlags?: unknown;
        isImpersonating?: unknown;
      } | null;
    } | null;
  };
  errors?: unknown;
};

const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  if (!WORKSPACE_ID_PATTERN.test(expectedWorkspaceId)) {
    throw new Error('Expected canonicalization workspace ID is invalid');
  }
  const response = await requestGate(() =>
    request.post(new URL('/graphql', origin).toString(), {
      headers: { Origin: origin },
      data: {
        operationName: 'CanonicalizationTenantPreflight',
        query: `query CanonicalizationTenantPreflight {
          currentUser {
            currentWorkspace { id displayName }
            currentUserWorkspace { permissionFlags isImpersonating }
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
  if (body.errors || workspace?.id !== expectedWorkspaceId) {
    throw new Error('Authenticated canonicalization workspace is not approved');
  }
  if (
    !Array.isArray(membership?.permissionFlags) ||
    !membership.permissionFlags.includes('DATA_MODEL') ||
    membership.isImpersonating === true
  ) {
    throw new Error(
      'Authenticated canonicalization session lacks metadata permission',
    );
  }
};
