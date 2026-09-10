import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import createdFunction, { handler } from 'src/modules/outreach/on-outreach-activity-created.logic-function';
import { OUTREACH_ACTIVITY_CREATED_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/modules/outreach/outreach-identifiers';
import { assignOutreachActivityOwner } from 'src/modules/outreach/services/assign-outreach-activity-owner.service';

vi.mock('twenty-client-sdk/core', () => ({ CoreApiClient: vi.fn() }));
vi.mock('src/modules/core/graphql/raw-core-graphql.transport', () => ({
  RawCoreGraphqlTransport: vi.fn(),
}));
vi.mock('src/modules/outreach/graphql/core-outreach.repository', () => ({
  CoreOutreachRepository: vi.fn(),
}));
vi.mock('src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository', () => ({
  CoreWholesalerRepository: vi.fn(),
}));
vi.mock('src/modules/outreach/services/assign-outreach-activity-owner.service', () => ({
  assignOutreachActivityOwner: vi.fn(),
}));

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const WHOLESALER_ID = '33333333-3333-4333-8333-333333333333';

const previousWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID;

const event = (
  after: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) =>
  ({
    workspaceId: WORKSPACE_ID,
    recordId: ACTIVITY_ID,
    properties: { after },
    ...overrides,
  }) as never;

describe('outreach activity database trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CORGI_CRM_WORKSPACE_ID = WORKSPACE_ID;
  });

  afterEach(() => {
    if (previousWorkspaceId === undefined) {
      delete process.env.CORGI_CRM_WORKSPACE_ID;
    } else {
      process.env.CORGI_CRM_WORKSPACE_ID = previousWorkspaceId;
    }
  });

  it('runs once for every newly created outreach activity', () => {
    expect(createdFunction.config.databaseEventTriggerSettings).toEqual({
      eventName: 'outreachActivity.created',
    });
    expect(createdFunction.config.universalIdentifier).toBe(
      OUTREACH_ACTIVITY_CREATED_FUNCTION_UNIVERSAL_IDENTIFIER,
    );
    expect(createdFunction.config.name).toBe('on-outreach-activity-created');
  });

  it('rejects a cross-workspace event before any Core access', async () => {
    await expect(
      handler(
        event(
          { createdBy: { workspaceMemberId: MEMBER_ID } },
          { workspaceId: OTHER_WORKSPACE_ID },
        ),
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'workspace_mismatch' });
    expect(assignOutreachActivityOwner).not.toHaveBeenCalled();
  });

  it('refuses to run when no workspace is configured', async () => {
    delete process.env.CORGI_CRM_WORKSPACE_ID;

    await expect(
      handler(event({ createdBy: { workspaceMemberId: MEMBER_ID } })),
    ).resolves.toEqual({ status: 'skipped', reason: 'workspace_mismatch' });
    expect(assignOutreachActivityOwner).not.toHaveBeenCalled();
  });

  it('passes the creating workspace member from the record attribution', async () => {
    vi.mocked(assignOutreachActivityOwner).mockResolvedValue({
      status: 'assigned',
      activityId: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });

    await expect(
      handler(
        event({
          id: ACTIVITY_ID,
          wholesalerId: null,
          createdBy: { workspaceMemberId: MEMBER_ID },
        }),
      ),
    ).resolves.toEqual({
      status: 'assigned',
      activityId: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });
    expect(assignOutreachActivityOwner).toHaveBeenCalledWith({
      activityId: ACTIVITY_ID,
      creatorWorkspaceMemberId: MEMBER_ID,
      activityRepository: expect.anything(),
      wholesalerRepository: expect.anything(),
    });
  });

  it('falls back to the event actor when the record carries no attribution', async () => {
    vi.mocked(assignOutreachActivityOwner).mockResolvedValue({
      status: 'assigned',
      activityId: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });

    await handler(
      event(
        { id: ACTIVITY_ID, createdBy: { workspaceMemberId: null } },
        { workspaceMemberId: MEMBER_ID },
      ),
    );
    expect(assignOutreachActivityOwner).toHaveBeenCalledWith(
      expect.objectContaining({ creatorWorkspaceMemberId: MEMBER_ID }),
    );
  });

  it('reports an unknown creator rather than inventing one', async () => {
    vi.mocked(assignOutreachActivityOwner).mockResolvedValue({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'unknown_creator',
    });

    await handler(event({ id: ACTIVITY_ID }));
    expect(assignOutreachActivityOwner).toHaveBeenCalledWith(
      expect.objectContaining({ creatorWorkspaceMemberId: null }),
    );
  });

  it('leaves an explicitly owned activity untouched without reading Core', async () => {
    await expect(
      handler(
        event({
          id: ACTIVITY_ID,
          wholesalerId: WHOLESALER_ID,
          createdBy: { workspaceMemberId: MEMBER_ID },
        }),
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'already_assigned' });
    expect(assignOutreachActivityOwner).not.toHaveBeenCalled();
  });

  it('skips an event that carries no record identity', async () => {
    await expect(
      handler(
        event(
          { createdBy: { workspaceMemberId: MEMBER_ID } },
          { recordId: undefined },
        ),
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'missing_event_identity' });
    expect(assignOutreachActivityOwner).not.toHaveBeenCalled();
  });

  it('retries a transient assignment failure with the original event evidence', async () => {
    const created = event({
      id: ACTIVITY_ID,
      wholesalerId: null,
      createdBy: { workspaceMemberId: MEMBER_ID },
    });
    vi.mocked(assignOutreachActivityOwner)
      .mockRejectedValueOnce(new Error('Owner assignment did not persist'))
      .mockResolvedValueOnce({
        status: 'skipped',
        activityId: ACTIVITY_ID,
        reason: 'already_assigned',
      });

    await expect(handler(created)).rejects.toBeInstanceOf(
      RetryableLogicFunctionError,
    );
    await expect(handler(created)).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'already_assigned',
    });
    expect(assignOutreachActivityOwner).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(assignOutreachActivityOwner).mock.calls) {
      expect(input).toMatchObject({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
      });
    }
  });
});
