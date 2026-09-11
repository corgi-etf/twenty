const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeetingBookingOwner = {
  id: string;
  bookedById: string | null;
};

export type MeetingBookingOwnerRepository = {
  get(id: string): Promise<MeetingBookingOwner | null>;
  assignUnassignedBookedBy(input: {
    id: string;
    bookedById: string;
  }): Promise<boolean>;
};

export const ASSIGN_MEETING_BOOKING_OWNER_SKIP_REASONS = [
  'meeting_not_found',
  'unknown_creator',
] as const;

export type AssignMeetingBookingOwnerSkipReason =
  (typeof ASSIGN_MEETING_BOOKING_OWNER_SKIP_REASONS)[number];

export type AssignMeetingBookingOwnerResult =
  | {
      status: 'claimed';
      meetingId: string;
      bookedByAssigned: boolean;
    }
  | {
      status: 'skipped';
      meetingId: string;
      reason: AssignMeetingBookingOwnerSkipReason;
      bookedByAssigned: boolean;
    };

export const assignMeetingBookingOwner = async ({
  meetingId,
  creatorWorkspaceMemberId,
  meetingRepository,
}: {
  meetingId: string;
  creatorWorkspaceMemberId: string | null;
  meetingRepository: MeetingBookingOwnerRepository;
}): Promise<AssignMeetingBookingOwnerResult> => {
  const record = await meetingRepository.get(meetingId);
  if (!record) {
    return {
      status: 'skipped',
      meetingId,
      reason: 'meeting_not_found',
      bookedByAssigned: false,
    };
  }
  // Only booked-by is claimed. The owner is deliberately left alone: every
  // meeting in production already carries an owner equal to its creator,
  // because people set it when they create the meeting. Filling it in
  // automatically changed nothing real and removed the owner-selection step
  // the release canary exercises.
  const bookedByAssigned =
    !record.bookedById &&
    !!creatorWorkspaceMemberId &&
    UUID_PATTERN.test(creatorWorkspaceMemberId)
      ? await meetingRepository.assignUnassignedBookedBy({
          id: meetingId,
          bookedById: creatorWorkspaceMemberId,
        })
      : false;

  if (!creatorWorkspaceMemberId || !UUID_PATTERN.test(creatorWorkspaceMemberId))
    return {
      status: 'skipped',
      meetingId,
      reason: 'unknown_creator',
      bookedByAssigned,
    };

  return { status: 'claimed', meetingId, bookedByAssigned };
};
