import { type MeetingBookingRecord } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import { MEETING_BOOKING_STATUS } from 'src/modules/meeting/meeting-identifiers';
import { type WholesalerRecord } from 'src/modules/wholesaler/onboarding/types';
import { isBusinessDevelopmentRepresentativeRole } from 'src/modules/wholesaler/wholesaler-role';

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

// Only the owner's role is needed here, but the whole record is what the
// Wholesaler repository already returns.
export type MeetingOwnerRepository = {
  findById(id: string): Promise<WholesalerRecord | null>;
};

export type ReconcileMeetingBookingResult = {
  status: 'booked' | 'invalid' | 'ignored';
  meetingId: string;
  message?: string;
};

const isRelationSelected = (id: string | null): boolean =>
  id !== null && UUID_PATTERN.test(id);

const missingBookingFields = (record: MeetingBookingRecord): string[] => {
  const missing: string[] = [];
  if (record.name.trim().length === 0) missing.push('meeting title');
  if (!isRelationSelected(record.companyId)) missing.push('RIA / company');
  if (!isRelationSelected(record.wholesalerId)) missing.push('owner');
  if (
    !record.scheduledAt ||
    !Number.isFinite(new Date(record.scheduledAt).getTime())
  ) {
    missing.push('scheduled date and time');
  }
  return missing;
};

// A BDR books for an external wholesaler, so their meeting is only complete
// once it names the EW it belongs to. Roles are workspace data nobody has
// filled in yet: today every Wholesaler still carries the legacy default, so
// this only ever returns true once someone deliberately types BDR on a record.
// Every other answer — no role, the legacy default, an unrecognised word, an
// owner this app cannot read back, or a Core failure while reading it — leaves
// booking exactly as it behaves today. Blocking a booking on anything less
// than a positive BDR match would stop the whole workspace booking meetings.
const ownerRequiresExternalWholesaler = async (
  ownerId: string,
  repository: MeetingOwnerRepository,
): Promise<boolean> => {
  try {
    const owner = await repository.findById(ownerId);
    return isBusinessDevelopmentRepresentativeRole(owner?.wholesalerRole);
  } catch {
    return false;
  }
};

export const reconcileMeetingBooking = async ({
  meetingId,
  eventOccurredAt,
  actorWorkspaceMemberId,
  repository,
  ownerRepository,
}: {
  meetingId: string;
  eventOccurredAt: string;
  actorWorkspaceMemberId: string | null;
  repository: MeetingBookingRepository;
  ownerRepository: MeetingOwnerRepository;
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
  // Reading the owner's role costs a Core round trip, so skip it whenever the
  // answer cannot change the outcome: an EW is already selected, or the
  // booking is already being rejected over its own fields.
  if (
    missing.length === 0 &&
    !isRelationSelected(record.externalWholesalerId) &&
    record.wholesalerId &&
    (await ownerRequiresExternalWholesaler(record.wholesalerId, ownerRepository))
  ) {
    missing.push('EW');
  }
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
