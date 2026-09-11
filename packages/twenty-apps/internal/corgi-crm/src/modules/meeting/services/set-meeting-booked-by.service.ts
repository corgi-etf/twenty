const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SetMeetingBookedByResult =
  | { status: 'updated'; meetingId: string; bookedById: string }
  | {
      status: 'refused';
      meetingId: string;
      reason: 'invalid_request' | 'unknown_member' | 'meeting_not_found';
    };

export const setMeetingBookedBy = async ({
  meetingId,
  bookedById,
  meetingRepository,
  memberRepository,
}: {
  meetingId: string;
  bookedById: string;
  meetingRepository: {
    get(id: string): Promise<{ id: string } | null>;
    setBookedBy(input: { id: string; bookedById: string }): Promise<boolean>;
  };
  memberRepository: {
    findWorkspaceMemberById(
      id: string,
    ): Promise<{ id: string; active: boolean } | null>;
  };
}): Promise<SetMeetingBookedByResult> => {
  if (!UUID_PATTERN.test(meetingId) || !UUID_PATTERN.test(bookedById)) {
    return { status: 'refused', meetingId, reason: 'invalid_request' };
  }
  if (!(await meetingRepository.get(meetingId))) {
    return { status: 'refused', meetingId, reason: 'meeting_not_found' };
  }
  // Resolve the target before writing: an id that is not a workspace member
  // would otherwise persist as an attribution pointing at nobody.
  const member = await memberRepository.findWorkspaceMemberById(bookedById);
  if (!member || member.id !== bookedById) {
    return { status: 'refused', meetingId, reason: 'unknown_member' };
  }
  if (!(await meetingRepository.setBookedBy({ id: meetingId, bookedById }))) {
    throw new Error('Meeting booked-by change did not persist');
  }
  return { status: 'updated', meetingId, bookedById };
};
