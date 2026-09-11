import { describe, expect, it, vi } from 'vitest';

import { setMeetingBookedBy } from 'src/modules/meeting/services/set-meeting-booked-by.service';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const MEETING_ID = uuid('1');
const MEMBER_ID = uuid('2');

const repositories = ({
  meeting = { id: MEETING_ID } as { id: string } | null,
  member = { id: MEMBER_ID, active: true } as
    | { id: string; active: boolean }
    | null,
  persisted = true,
} = {}) => ({
  meetingRepository: {
    get: vi.fn().mockResolvedValue(meeting),
    setBookedBy: vi.fn().mockResolvedValue(persisted),
  },
  memberRepository: {
    findWorkspaceMemberById: vi.fn().mockResolvedValue(member),
  },
});

describe('setMeetingBookedBy', () => {
  it('reattributes the meeting to the chosen member', async () => {
    const repos = repositories();

    await expect(
      setMeetingBookedBy({ meetingId: MEETING_ID, bookedById: MEMBER_ID, ...repos }),
    ).resolves.toEqual({
      status: 'updated',
      meetingId: MEETING_ID,
      bookedById: MEMBER_ID,
    });
    expect(repos.meetingRepository.setBookedBy).toHaveBeenCalledWith({
      id: MEETING_ID,
      bookedById: MEMBER_ID,
    });
  });

  it.each([
    ['a malformed meeting id', { meetingId: 'nope', bookedById: MEMBER_ID }],
    ['a malformed member id', { meetingId: MEETING_ID, bookedById: 'nope' }],
  ])('refuses %s without writing', async (_n, input) => {
    const repos = repositories();
    await expect(setMeetingBookedBy({ ...input, ...repos })).resolves.toMatchObject({
      status: 'refused',
      reason: 'invalid_request',
    });
    expect(repos.meetingRepository.setBookedBy).not.toHaveBeenCalled();
  });

  it('refuses a member that does not exist rather than attributing to nobody', async () => {
    const repos = repositories({ member: null });
    await expect(
      setMeetingBookedBy({ meetingId: MEETING_ID, bookedById: MEMBER_ID, ...repos }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'unknown_member' });
    expect(repos.meetingRepository.setBookedBy).not.toHaveBeenCalled();
  });

  it('refuses a meeting that does not exist', async () => {
    const repos = repositories({ meeting: null });
    await expect(
      setMeetingBookedBy({ meetingId: MEETING_ID, bookedById: MEMBER_ID, ...repos }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'meeting_not_found' });
    expect(repos.meetingRepository.setBookedBy).not.toHaveBeenCalled();
  });

  it('raises rather than reporting success when the write does not persist', async () => {
    const repos = repositories({ persisted: false });
    await expect(
      setMeetingBookedBy({ meetingId: MEETING_ID, bookedById: MEMBER_ID, ...repos }),
    ).rejects.toThrow(/did not persist/);
  });

  // Overwriting is the point of this path, unlike the creation-time claim.
  it('overwrites an attribution that is already set', async () => {
    const repos = repositories();
    await setMeetingBookedBy({
      meetingId: MEETING_ID,
      bookedById: MEMBER_ID,
      ...repos,
    });
    expect(repos.meetingRepository.setBookedBy).toHaveBeenCalledTimes(1);
  });
});
