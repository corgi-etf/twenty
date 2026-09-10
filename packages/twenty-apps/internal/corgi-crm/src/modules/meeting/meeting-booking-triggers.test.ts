import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import createdFunction, { handler as createdHandler } from 'src/modules/meeting/on-meeting-booking-created.logic-function';
import statusUpdatedFunction, { handler as statusUpdatedHandler } from 'src/modules/meeting/on-meeting-booking-status-updated.logic-function';
import { reconcileMeetingBooking } from 'src/modules/meeting/services/reconcile-meeting-booking.service';

vi.mock('twenty-client-sdk/core', () => ({ CoreApiClient: vi.fn() }));
vi.mock('src/modules/meeting/graphql/core-meeting-booking.repository', () => ({
  CoreMeetingBookingRepository: vi.fn(),
}));
vi.mock('src/modules/meeting/services/reconcile-meeting-booking.service', () => ({
  reconcileMeetingBooking: vi.fn(),
}));

const previousWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID;

describe('meeting booking database triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CORGI_CRM_WORKSPACE_ID =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  });

  it('runs create reconciliation once and status reconciliation only on status changes', () => {
    expect(createdFunction.config.databaseEventTriggerSettings).toEqual({
      eventName: 'meetingBooking.created',
    });
    expect(statusUpdatedFunction.config.databaseEventTriggerSettings).toEqual({
      eventName: 'meetingBooking.updated',
      updatedFields: ['status'],
    });
  });

  afterEach(() => {
    if (previousWorkspaceId === undefined) {
      delete process.env.CORGI_CRM_WORKSPACE_ID;
    } else {
      process.env.CORGI_CRM_WORKSPACE_ID = previousWorkspaceId;
    }
  });

  it.each([createdHandler, statusUpdatedHandler])(
    'rejects a cross-workspace event before any Core access',
    async (handler) => {
      await expect(
        handler({
          workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          recordId: '11111111-1111-4111-8111-111111111111',
          properties: {
            after: {
              status: 'BOOKED',
              updatedAt: '2026-09-10T13:15:00.000Z',
            },
          },
        } as never),
      ).resolves.toEqual({ status: 'skipped', reason: 'workspace_mismatch' });
      expect(reconcileMeetingBooking).not.toHaveBeenCalled();
    },
  );

  it.each([createdHandler, statusUpdatedHandler])(
    'passes deterministic event time and exact ACTOR member ID',
    async (handler) => {
      vi.mocked(reconcileMeetingBooking).mockResolvedValue({
        status: 'booked',
        meetingId: '11111111-1111-4111-8111-111111111111',
      });
      await handler({
        workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: '11111111-1111-4111-8111-111111111111',
        properties: {
          after: {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'BOOKED',
            updatedAt: '2026-09-10T13:15:00.000Z',
            updatedBy: {
              workspaceMemberId: '44444444-4444-4444-8444-444444444444',
            },
          },
        },
      } as never);
      expect(reconcileMeetingBooking).toHaveBeenCalledWith({
        meetingId: '11111111-1111-4111-8111-111111111111',
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: '44444444-4444-4444-8444-444444444444',
        repository: expect.anything(),
      });
    },
  );

  it.each([createdHandler, statusUpdatedHandler])(
    'ignores an old DRAFT event even if the record is BOOKED when it runs',
    async (handler) => {
      await expect(
        handler({
          workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          recordId: '11111111-1111-4111-8111-111111111111',
          properties: {
            after: {
              status: 'DRAFT',
              updatedAt: '2026-09-10T13:00:00.000Z',
            },
          },
        } as never),
      ).resolves.toEqual({
        status: 'skipped',
        reason: 'missing_event_identity',
      });
      expect(reconcileMeetingBooking).not.toHaveBeenCalled();
    },
  );

  it.each([createdHandler, statusUpdatedHandler])(
    'fails malformed event time permanently before repository reconciliation',
    async (handler) => {
      await expect(
        handler({
          workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          recordId: '11111111-1111-4111-8111-111111111111',
          properties: {
            after: {
              status: 'BOOKED',
              updatedAt: 'not-a-timestamp',
            },
          },
        } as never),
      ).rejects.not.toBeInstanceOf(RetryableLogicFunctionError);
      expect(reconcileMeetingBooking).not.toHaveBeenCalled();
    },
  );

  it.each([createdHandler, statusUpdatedHandler])(
    'retries a transient reconciliation failure with the original event evidence',
    async (handler) => {
      const event = {
        workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: '11111111-1111-4111-8111-111111111111',
        properties: {
          after: {
            status: 'BOOKED',
            updatedAt: '2026-09-10T13:15:00.000Z',
            updatedBy: {
              workspaceMemberId: '44444444-4444-4444-8444-444444444444',
            },
          },
        },
      } as const;
      vi.mocked(reconcileMeetingBooking)
        .mockRejectedValueOnce(new Error('Meeting changed while booking'))
        .mockResolvedValueOnce({
          status: 'booked',
          meetingId: event.recordId,
        });

      await expect(handler(event as never)).rejects.toBeInstanceOf(
        RetryableLogicFunctionError,
      );
      await expect(handler(event as never)).resolves.toEqual({
        status: 'booked',
        meetingId: event.recordId,
      });
      expect(reconcileMeetingBooking).toHaveBeenCalledTimes(2);
      for (const [input] of vi.mocked(reconcileMeetingBooking).mock.calls) {
        expect(input).toMatchObject({
          meetingId: event.recordId,
          eventOccurredAt: event.properties.after.updatedAt,
          actorWorkspaceMemberId:
            event.properties.after.updatedBy.workspaceMemberId,
        });
      }
    },
  );
});
