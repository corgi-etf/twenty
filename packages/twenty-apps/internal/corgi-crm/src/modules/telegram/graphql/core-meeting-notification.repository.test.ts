import { describe, expect, it, vi } from 'vitest';
import { parse, print } from 'graphql';

import { CoreMeetingNotificationRepository } from 'src/modules/telegram/graphql/core-meeting-notification.repository';

describe('CoreMeetingNotificationRepository', () => {
  it('reads the exact booking and human display relations needed by the alert', async () => {
    const meetingBooking = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'BOOKED',
      bookedAt: '2026-09-10T05:30:00.000Z',
      scheduledAt: '2026-09-15T19:00:00.000Z',
      company: { id: '22222222-2222-4222-8222-222222222222', name: 'RIA' },
      wholesaler: { id: '33333333-3333-4333-8333-333333333333', name: 'Nash' },
      bookedBy: {
        id: '44444444-4444-4444-8444-444444444444',
        name: { firstName: 'Grace', lastName: 'Kelly' },
      },
    };
    const request = vi.fn().mockResolvedValue({ meetingBooking });
    const repository = new CoreMeetingNotificationRepository({
      request,
    } as never);

    await expect(repository.findById(meetingBooking.id)).resolves.toEqual(
      meetingBooking,
    );
    expect(request).toHaveBeenCalledWith({
      operationName: 'ReadMeetingForNotification',
      document: expect.any(String),
      variables: { meetingId: meetingBooking.id },
    });
    expect(print(parse(request.mock.calls[0]![0].document))).toBe(
      print(
        parse(`
      query ReadMeetingForNotification($meetingId: UUID!) {
        meetingBooking(filter: { id: { eq: $meetingId } }) {
          id status bookedAt scheduledAt
          company { id name }
          wholesaler { id name }
          bookedBy { id name { firstName lastName } }
        }
      }
    `),
      ),
    );
  });

  it('returns null only for an authoritative missing booking', async () => {
    const request = vi.fn().mockResolvedValue({ meetingBooking: null });
    await expect(
      new CoreMeetingNotificationRepository({ request } as never).findById(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toBeNull();
  });

  it.each([
    {},
    { meetingBooking: undefined },
    { meetingBooking: [] },
    {
      meetingBooking: { id: '22222222-2222-4222-8222-222222222222' },
    },
  ])(
    'rejects a malformed or different authoritative booking: %j',
    async (response) => {
      const request = vi.fn().mockResolvedValue(response);
      await expect(
        new CoreMeetingNotificationRepository({ request } as never).findById(
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow(
        'Meeting notification query returned an invalid record',
      );
    },
  );

  it('does not turn a transport failure into an absent record', async () => {
    const request = vi.fn().mockRejectedValue(new Error('CRM unavailable'));
    await expect(
      new CoreMeetingNotificationRepository({ request } as never).findById(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toThrow('CRM unavailable');
  });
});
