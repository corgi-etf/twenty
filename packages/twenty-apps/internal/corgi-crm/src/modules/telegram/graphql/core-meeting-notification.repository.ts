import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type MeetingBookingNotificationSource } from 'src/modules/telegram/services/meeting-booked-notification.service';

type QueryClient = {
  query(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export class CoreMeetingNotificationRepository {
  private readonly client: QueryClient;

  public constructor(client: CoreApiClient) {
    this.client = client as unknown as QueryClient;
  }

  public async findById(
    meetingId: string,
  ): Promise<MeetingBookingNotificationSource | null> {
    const result = await this.client.query({
      meetingBooking: {
        __args: { filter: { id: { eq: meetingId } } },
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
    return (result.meetingBooking as MeetingBookingNotificationSource | null) ?? null;
  }
}
