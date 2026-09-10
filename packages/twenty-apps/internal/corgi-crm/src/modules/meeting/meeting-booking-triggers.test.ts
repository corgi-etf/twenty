import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
          properties: { after: { updatedAt: '2026-09-10T13:15:00.000Z' } },
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
});
