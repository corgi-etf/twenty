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

export type MeetingBookingEventSnapshot = Partial<
  Pick<
    MeetingBookingRecord,
    'name' | 'scheduledAt' | 'companyId' | 'wholesalerId'
  >
> & { status?: string | null };
const missingBookingFields = (
  record: MeetingBookingEventSnapshot,
): string[] => {
  const missing: string[] = [];
  if (!(record.name ?? '').trim()) missing.push('meeting title');
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
  eventSnapshot,
  repository,
}: {
  meetingId: string;
  eventOccurredAt: string;
  actorWorkspaceMemberId: string | null;
  eventSnapshot?: MeetingBookingEventSnapshot;
  repository: MeetingBookingRepository;
}): Promise<ReconcileMeetingBookingResult> => {
  const record = await repository.get(meetingId);
  // Completed counts as booked for stamping purposes. A meeting cannot have
  // been completed without having been set, and in practice people move
  // straight from Draft to Completed -- so keying only on Booked left bookedAt
  // null on every real meeting, and the alert that watches bookedAt never
  // fired once. Booked still stamps at the moment it is set, which is earlier
  // and remains the better path.
  const isStampableStatus =
    record?.status === MEETING_BOOKING_STATUS.BOOKED ||
    record?.status === MEETING_BOOKING_STATUS.COMPLETED;
  if (!record || !isStampableStatus || record.bookedAt !== null) {
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

  // A delayed event can prove the first valid booking even after rescheduling
  // or completion, but an incomplete event cannot borrow a later user's repair.
  if (
    eventSnapshot
      ? missingBookingFields(eventSnapshot).length > 0 ||
        ![MEETING_BOOKING_STATUS.BOOKED, MEETING_BOOKING_STATUS.COMPLETED].some(
          (status) => status === eventSnapshot.status,
        )
      : Date.parse(eventOccurredAt) !== Date.parse(record.updatedAt)
  )
    return { status: 'ignored', meetingId };

  const occurredAt = new Date(eventOccurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error('Meeting booking event has an invalid timestamp');
  }
  const booked = await repository.stampBooked({
    id: meetingId,
    bookedAt: occurredAt.toISOString(),
    bookedById:
      record.bookedById ??
      (actorWorkspaceMemberId && UUID_PATTERN.test(actorWorkspaceMemberId)
        ? actorWorkspaceMemberId
        : null),
    expectedUpdatedAt: record.updatedAt,
  });
  if (!booked) {
    throw new Error('Meeting changed while booking; retry reconciliation');
  }
  return { status: 'booked', meetingId };
};
