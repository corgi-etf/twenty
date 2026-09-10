import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { type MeetingBookingNotificationSource } from 'src/modules/telegram/services/meeting-booked-notification.service';

type MeetingNotificationData = {
  meetingBooking: MeetingBookingNotificationSource | null;
};
type MeetingNotificationVariables = { meetingId: string };

const READ_MEETING_FOR_NOTIFICATION = `
  query ReadMeetingForNotification($meetingId: UUID!) {
    meetingBooking(filter: { id: { eq: $meetingId } }) {
      id
      status
      bookedAt
      scheduledAt
      company { id name }
      wholesaler { id name }
      bookedBy { id name { firstName lastName } }
    }
  }
`;

export class CoreMeetingNotificationRepository {
  public constructor(private readonly rawTransport: RawCoreGraphqlTransport) {}

  public async findById(
    meetingId: string,
  ): Promise<MeetingBookingNotificationSource | null> {
    const result = await this.rawTransport.request<
      MeetingNotificationData,
      MeetingNotificationVariables
    >({
      operationName: 'ReadMeetingForNotification',
      document: READ_MEETING_FOR_NOTIFICATION,
      variables: { meetingId },
    });
    const booking = result.meetingBooking;
    if (booking === null) return null;
    if (
      !booking ||
      typeof booking !== 'object' ||
      Array.isArray(booking) ||
      booking.id !== meetingId
    ) {
      throw new Error('Meeting notification query returned an invalid record');
    }
    return booking;
  }
}
