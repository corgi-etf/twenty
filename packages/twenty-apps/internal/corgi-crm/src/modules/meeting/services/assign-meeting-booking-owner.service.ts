import { type WholesalerRepository } from 'src/modules/wholesaler/onboarding/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeetingBookingOwner = {
  id: string;
  wholesalerId: string | null;
};

export type MeetingBookingOwnerRepository = {
  get(id: string): Promise<MeetingBookingOwner | null>;
  assignUnassignedOwner(input: {
    id: string;
    wholesalerId: string;
  }): Promise<boolean>;
};

export const ASSIGN_MEETING_BOOKING_OWNER_SKIP_REASONS = [
  'meeting_not_found',
  'already_assigned',
  'unknown_creator',
  'creator_has_no_wholesaler',
  'ambiguous_creator_wholesaler',
] as const;

export type AssignMeetingBookingOwnerSkipReason =
  (typeof ASSIGN_MEETING_BOOKING_OWNER_SKIP_REASONS)[number];

export type AssignMeetingBookingOwnerResult =
  | { status: 'assigned'; meetingId: string; wholesalerId: string }
  | {
      status: 'skipped';
      meetingId: string;
      reason: AssignMeetingBookingOwnerSkipReason;
    };

export const assignMeetingBookingOwner = async ({
  meetingId,
  creatorWorkspaceMemberId,
  meetingRepository,
  wholesalerRepository,
}: {
  meetingId: string;
  creatorWorkspaceMemberId: string | null;
  meetingRepository: MeetingBookingOwnerRepository;
  wholesalerRepository: Pick<WholesalerRepository, 'findByWorkspaceMemberId'>;
}): Promise<AssignMeetingBookingOwnerResult> => {
  const record = await meetingRepository.get(meetingId);
  if (!record) {
    return { status: 'skipped', meetingId, reason: 'meeting_not_found' };
  }
  // A wholesaler someone chose always wins. A re-delivered create event must
  // read the record as it is now, never as the event described it.
  if (record.wholesalerId) {
    return { status: 'skipped', meetingId, reason: 'already_assigned' };
  }
  if (
    !creatorWorkspaceMemberId ||
    !UUID_PATTERN.test(creatorWorkspaceMemberId)
  ) {
    return { status: 'skipped', meetingId, reason: 'unknown_creator' };
  }

  const wholesalers = (
    await wholesalerRepository.findByWorkspaceMemberId(creatorWorkspaceMemberId)
  ).filter(
    (wholesaler) => wholesaler.workspaceMemberId === creatorWorkspaceMemberId,
  );
  if (wholesalers.length === 0) {
    return {
      status: 'skipped',
      meetingId,
      reason: 'creator_has_no_wholesaler',
    };
  }
  if (wholesalers.length > 1) {
    // Fail closed: onboarding reconciliation keeps this one-to-one, so a
    // duplicate link is a data fault to repair, not an owner to guess.
    return {
      status: 'skipped',
      meetingId,
      reason: 'ambiguous_creator_wholesaler',
    };
  }

  const wholesalerId = wholesalers[0]!.id;
  const assigned = await meetingRepository.assignUnassignedOwner({
    id: meetingId,
    wholesalerId,
  });
  if (assigned) return { status: 'assigned', meetingId, wholesalerId };

  const persisted = await meetingRepository.get(meetingId);
  if (persisted?.wholesalerId) {
    return { status: 'skipped', meetingId, reason: 'already_assigned' };
  }
  throw new Error('Meeting booking owner assignment did not persist');
};
