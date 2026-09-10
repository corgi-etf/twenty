import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handler } from 'src/modules/wholesaler/onboarding/post-install.logic-function';
import { reconcileAllWorkspaceMembers } from 'src/modules/wholesaler/onboarding/services/reconcile-all-workspace-members.service';

vi.mock('twenty-client-sdk/core', () => ({ CoreApiClient: vi.fn() }));
vi.mock(
  'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository',
  () => ({ CoreWholesalerRepository: vi.fn() }),
);
vi.mock(
  'src/modules/wholesaler/onboarding/services/reconcile-all-workspace-members.service',
  () => ({ reconcileAllWorkspaceMembers: vi.fn() }),
);

const previousWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID;
const installPayload = { newVersion: '1.0.0' };
const executionContext = {
  retryCount: 0,
  maxRetries: 3,
  workspaceId: 'corgi-workspace',
  userWorkspaceId: null,
  workspaceMemberId: null,
};

describe('post-install handler', () => {
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

  it('fails before querying when the execution workspace is unavailable', async () => {
    await expect(handler(installPayload)).rejects.toThrow(
      'execution context must include the installation workspace ID',
    );
    expect(reconcileAllWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('fails before querying when the execution workspace is not expected', async () => {
    await expect(
      handler(installPayload, {
        ...executionContext,
        workspaceId: 'another-workspace',
      }),
    ).rejects.toThrow('refused workspace another-workspace');
    expect(reconcileAllWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('reconciles using the verified execution workspace', async () => {
    vi.mocked(reconcileAllWorkspaceMembers).mockResolvedValue({
      created: 1,
      updated: 0,
      unchanged: 0,
      failures: [],
    });

    await expect(handler(installPayload, executionContext)).resolves.toMatchObject({
      created: 1,
      failures: [],
    });
    expect(reconcileAllWorkspaceMembers).toHaveBeenCalledWith({
      workspaceId: 'corgi-workspace',
      repository: expect.anything(),
    });
  });

  it('reports only aggregate stage and class counts for failed members', async () => {
    vi.mocked(reconcileAllWorkspaceMembers).mockResolvedValue({
      created: 0,
      updated: 0,
      unchanged: 0,
      failures: [
        { stage: 'lookup_email', code: 'schema_mismatch' },
        { stage: 'create', code: 'permission_denied' },
        { stage: 'lookup_email', code: 'schema_mismatch' },
      ],
    });

    const failure = await handler(installPayload, executionContext).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      'Wholesaler reconciliation failed closed for 3 workspace member(s): create/permission_denied=1, lookup_email/schema_mismatch=2',
    );
    expect((failure as Error).message).not.toMatch(
      /member-\d|private|@|graphql|provider/i,
    );
  });
});
