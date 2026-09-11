import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import ownerFunction, { handler } from 'src/modules/meeting/assign-meeting-booking-owner.logic-function';
import { MEETING_BOOKING_OWNER_ASSIGNMENT_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';
import { assignMeetingBookingOwner } from 'src/modules/meeting/services/assign-meeting-booking-owner.service';

vi.mock('twenty-client-sdk/core', () => ({ CoreApiClient: vi.fn() }));
vi.mock('src/modules/core/graphql/raw-core-graphql.transport', () => ({
  RawCoreGraphqlTransport: vi.fn(),
}));
vi.mock('src/modules/meeting/graphql/core-meeting-booking.repository', () => ({
  CoreMeetingBookingRepository: vi.fn(),
}));
vi.mock('src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository', () => ({
  CoreWholesalerRepository: vi.fn(),
}));
vi.mock('src/modules/meeting/services/assign-meeting-booking-owner.service', () => ({
  assignMeetingBookingOwner: vi.fn(),
}));

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const WHOLESALER_ID = '33333333-3333-4333-8333-333333333333';

const previousWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID;

const event = (
  after: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) =>
  ({
    workspaceId: WORKSPACE_ID,
    recordId: MEETING_ID,
    properties: { after },
    ...overrides,
  }) as never;

describe('meeting booking owner assignment trigger', () => {
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

  it('runs once for every newly created meeting booking', () => {
    expect(ownerFunction.config.databaseEventTriggerSettings).toEqual({
      eventName: 'meetingBooking.created',
    });
    expect(ownerFunction.config.universalIdentifier).toBe(
      MEETING_BOOKING_OWNER_ASSIGNMENT_FUNCTION_UNIVERSAL_IDENTIFIER,
    );
    expect(ownerFunction.config.name).toBe('assign-meeting-booking-owner');
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
    expect(assignMeetingBookingOwner).not.toHaveBeenCalled();
  });

  it('refuses to run when no workspace is configured', async () => {
    delete process.env.CORGI_CRM_WORKSPACE_ID;

    await expect(
      handler(event({ createdBy: { workspaceMemberId: MEMBER_ID } })),
    ).resolves.toEqual({ status: 'skipped', reason: 'workspace_mismatch' });
    expect(assignMeetingBookingOwner).not.toHaveBeenCalled();
  });

  it('passes the creating workspace member from the record attribution', async () => {
    vi.mocked(assignMeetingBookingOwner).mockResolvedValue({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
    });

    await expect(
      handler(
        event({
          id: MEETING_ID,
          wholesalerId: null,
          createdBy: { workspaceMemberId: MEMBER_ID },
        }),
      ),
    ).resolves.toEqual({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
    });
    expect(assignMeetingBookingOwner).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      creatorWorkspaceMemberId: MEMBER_ID,
      meetingRepository: expect.anything(),
      wholesalerRepository: expect.anything(),
    });
  });

  it('falls back to the event actor when the record carries no attribution', async () => {
    vi.mocked(assignMeetingBookingOwner).mockResolvedValue({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
    });

    await handler(
      event(
        { id: MEETING_ID, createdBy: { workspaceMemberId: null } },
        { workspaceMemberId: MEMBER_ID },
      ),
    );
    expect(assignMeetingBookingOwner).toHaveBeenCalledWith(
      expect.objectContaining({ creatorWorkspaceMemberId: MEMBER_ID }),
    );
  });

  it('reports an unknown creator rather than inventing one', async () => {
    vi.mocked(assignMeetingBookingOwner).mockResolvedValue({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'unknown_creator',
    });

    await handler(event({ id: MEETING_ID }));
    expect(assignMeetingBookingOwner).toHaveBeenCalledWith(
      expect.objectContaining({ creatorWorkspaceMemberId: null }),
    );
  });

  it('leaves an explicitly owned meeting untouched without reading Core', async () => {
    await expect(
      handler(
        event({
          id: MEETING_ID,
          wholesalerId: WHOLESALER_ID,
          createdBy: { workspaceMemberId: MEMBER_ID },
        }),
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'already_assigned' });
    expect(assignMeetingBookingOwner).not.toHaveBeenCalled();
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
    expect(assignMeetingBookingOwner).not.toHaveBeenCalled();
  });

  it('assigns regardless of the status the meeting was created in', async () => {
    vi.mocked(assignMeetingBookingOwner).mockResolvedValue({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
    });

    for (const status of ['DRAFT', 'BOOKED']) {
      await handler(
        event({
          id: MEETING_ID,
          status,
          wholesalerId: null,
          createdBy: { workspaceMemberId: MEMBER_ID },
        }),
      );
    }
    expect(assignMeetingBookingOwner).toHaveBeenCalledTimes(2);
  });

  it('retries a transient assignment failure with the original event evidence', async () => {
    const created = event({
      id: MEETING_ID,
      wholesalerId: null,
      createdBy: { workspaceMemberId: MEMBER_ID },
    });
    vi.mocked(assignMeetingBookingOwner)
      .mockRejectedValueOnce(new Error('Owner assignment did not persist'))
      .mockResolvedValueOnce({
        status: 'skipped',
        meetingId: MEETING_ID,
        reason: 'already_assigned',
      });

    await expect(handler(created)).rejects.toBeInstanceOf(
      RetryableLogicFunctionError,
    );
    await expect(handler(created)).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'already_assigned',
    });
    expect(assignMeetingBookingOwner).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(assignMeetingBookingOwner).mock.calls) {
      expect(input).toMatchObject({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
      });
    }
  });
});
