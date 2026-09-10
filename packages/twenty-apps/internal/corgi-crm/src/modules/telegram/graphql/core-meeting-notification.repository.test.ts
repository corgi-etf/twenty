import { describe, expect, it, vi } from 'vitest';

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
    const query = vi.fn().mockResolvedValue({ meetingBooking });
    const repository = new CoreMeetingNotificationRepository({ query } as never);

    await expect(repository.findById(meetingBooking.id)).resolves.toEqual(
      meetingBooking,
    );
    expect(query).toHaveBeenCalledWith({
      meetingBooking: {
        __args: { filter: { id: { eq: meetingBooking.id } } },
        id: true,
        status: true,
        bookedAt: true,
        scheduledAt: true,
        company: { id: true, name: true },
        wholesaler: { id: true, name: true },
        bookedBy: {
          id: true,
          name: { firstName: true, lastName: true },
        },
      },
    });
  });
});
