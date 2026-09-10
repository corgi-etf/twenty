import { type MeetingBookingRecord } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import { MEETING_BOOKING_STATUS } from 'src/modules/meeting/meeting-identifiers';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeetingBookingRepository = {
  get(id: string): Promise<MeetingBookingRecord | null>;
  stampBooked(input: {
    id: string;
    bookedAt: string;
    bookedById: string | null;
    expectedUpdatedAt: string;
  }): Promise<boolean>;
  rejectInvalidBooking(input: {
    id: string;
    message: string;
    expectedUpdatedAt: string;
  }): Promise<boolean>;
};

export type ReconcileMeetingBookingResult = {
  status: 'booked' | 'invalid' | 'ignored';
  meetingId: string;
  message?: string;
};

const missingBookingFields = (record: MeetingBookingRecord): string[] => {
  const missing: string[] = [];
  if (record.name.trim().length === 0) missing.push('meeting title');
  if (!record.companyId || !UUID_PATTERN.test(record.companyId)) {
    missing.push('RIA / company');
  }
  if (!record.wholesalerId || !UUID_PATTERN.test(record.wholesalerId)) {
    missing.push('owner');
  }
  if (
    !record.scheduledAt ||
    !Number.isFinite(new Date(record.scheduledAt).getTime())
  ) {
    missing.push('scheduled date and time');
  }
  return missing;
};

export const reconcileMeetingBooking = async ({
  meetingId,
  eventOccurredAt,
  actorWorkspaceMemberId,
  repository,
}: {
  meetingId: string;
  eventOccurredAt: string;
  actorWorkspaceMemberId: string | null;
  repository: MeetingBookingRepository;
}): Promise<ReconcileMeetingBookingResult> => {
  const record = await repository.get(meetingId);
  if (
    !record ||
    record.status !== MEETING_BOOKING_STATUS.BOOKED ||
    record.bookedAt !== null
  ) {
    return { status: 'ignored', meetingId };
  }

  const missing = missingBookingFields(record);
  if (missing.length > 0) {
    const message = `Set ${missing.join(', ')} before booking.`;
    const rejected = await repository.rejectInvalidBooking({
      id: meetingId,
      message,
      expectedUpdatedAt: record.updatedAt,
    });
    if (!rejected) {
      throw new Error('Meeting changed while rejecting an invalid booking');
    }
    return { status: 'invalid', meetingId, message };
  }

  const occurredAt = new Date(eventOccurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error('Meeting booking event has an invalid timestamp');
  }
  const booked = await repository.stampBooked({
    id: meetingId,
    bookedAt: occurredAt.toISOString(),
    bookedById:
      actorWorkspaceMemberId && UUID_PATTERN.test(actorWorkspaceMemberId)
        ? actorWorkspaceMemberId
        : null,
    expectedUpdatedAt: record.updatedAt,
  });
  if (!booked) {
    throw new Error('Meeting changed while booking; retry reconciliation');
  }
  return { status: 'booked', meetingId };
};
