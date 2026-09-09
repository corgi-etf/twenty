import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handler } from 'src/modules/wholesaler/onboarding/on-workspace-member-created.logic-function';
import { reconcileWorkspaceMember } from 'src/modules/wholesaler/onboarding/services/reconcile-workspace-member.service';

vi.mock('twenty-client-sdk/core', () => ({ CoreApiClient: vi.fn() }));
vi.mock(
  'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository',
  () => ({ CoreWholesalerRepository: vi.fn() }),
);
vi.mock(
  'src/modules/wholesaler/onboarding/services/reconcile-workspace-member.service',
  () => ({ reconcileWorkspaceMember: vi.fn() }),
);

const previousWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID;

describe('workspaceMember.created handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CORGI_CRM_WORKSPACE_ID = 'corgi-workspace';
  });

  afterEach(() => {
    if (previousWorkspaceId === undefined) {
      delete process.env.CORGI_CRM_WORKSPACE_ID;
    } else {
      process.env.CORGI_CRM_WORKSPACE_ID = previousWorkspaceId;
    }
  });

  it('skips an event without a usable email', async () => {
    await expect(
      handler({
        workspaceId: 'corgi-workspace',
        recordId: 'member-1',
        properties: { after: { userEmail: null } },
      } as never),
    ).resolves.toEqual({ status: 'skipped', reason: 'missing_identity' });
    expect(reconcileWorkspaceMember).not.toHaveBeenCalled();
  });

  it('passes the event workspace and complete member identity to reconciliation', async () => {
    vi.mocked(reconcileWorkspaceMember).mockResolvedValue({
      status: 'created',
      wholesalerId: 'member-1',
    });

    await handler({
      workspaceId: 'corgi-workspace',
      recordId: 'member-1',
      properties: {
        after: {
          userEmail: 'Damien@Corgi.com',
          name: { firstName: 'Damien', lastName: 'Wiese' },
        },
      },
    } as never);

    expect(reconcileWorkspaceMember).toHaveBeenCalledWith({
      eventWorkspaceId: 'corgi-workspace',
      targetWorkspaceId: 'corgi-workspace',
      member: {
        id: 'member-1',
        email: 'Damien@Corgi.com',
        firstName: 'Damien',
        lastName: 'Wiese',
      },
      repository: expect.anything(),
    });
  });
});
