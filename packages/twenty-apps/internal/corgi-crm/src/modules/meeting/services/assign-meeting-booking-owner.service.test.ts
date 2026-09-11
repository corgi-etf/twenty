import { describe, expect, it, vi } from 'vitest';

import {
  assignMeetingBookingOwner,
  type MeetingBookingOwner,
  type MeetingBookingOwnerRepository,
} from 'src/modules/meeting/services/assign-meeting-booking-owner.service';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const MEETING_ID = uuid('1');
const MEMBER_ID = uuid('2');

const meetingRepository = ({
  records = [{ id: MEETING_ID, bookedById: null }] as Array<MeetingBookingOwner | null>,
  claimed = true,
} = {}): MeetingBookingOwnerRepository => {
  const queue = [...records];
  return {
    get: vi
      .fn()
      .mockImplementation(async () =>
        queue.length > 1 ? queue.shift()! : queue[0]!,
      ),
    assignUnassignedBookedBy: vi.fn().mockResolvedValue(claimed),
  };
};

describe('assignMeetingBookingOwner', () => {
  it('claims booked-by for the member who created the meeting', async () => {
    const meetings = meetingRepository();

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
      }),
    ).resolves.toEqual({
      status: 'claimed',
      meetingId: MEETING_ID,
      bookedByAssigned: true,
    });
    expect(meetings.assignUnassignedBookedBy).toHaveBeenCalledWith({
      id: MEETING_ID,
      bookedById: MEMBER_ID,
    });
  });

  // The owner is set on every real meeting, so short-circuiting on it would
  // skip the claim on exactly the records that need it.
  it('claims booked-by even though the meeting already has an owner', async () => {
    const meetings = meetingRepository();
    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
      }),
    ).resolves.toMatchObject({ bookedByAssigned: true });
  });

  it('never overwrites a booked-by someone already chose', async () => {
    const meetings = meetingRepository({
      records: [{ id: MEETING_ID, bookedById: uuid('9') }],
    });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
      }),
    ).resolves.toMatchObject({ status: 'claimed', bookedByAssigned: false });
    expect(meetings.assignUnassignedBookedBy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing creator', null],
    ['a malformed creator', 'not-a-uuid'],
  ])('reports %s rather than inventing one', async (_name, creator) => {
    const meetings = meetingRepository();

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: creator,
        meetingRepository: meetings,
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'unknown_creator',
      bookedByAssigned: false,
    });
    expect(meetings.assignUnassignedBookedBy).not.toHaveBeenCalled();
  });

  it('reports a meeting that no longer exists without writing', async () => {
    const meetings = meetingRepository({ records: [null] });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'meeting_not_found',
      bookedByAssigned: false,
    });
    expect(meetings.assignUnassignedBookedBy).not.toHaveBeenCalled();
  });

  it('is idempotent across a re-delivered create event', async () => {
    const store = { bookedById: null as string | null };
    const meetings: MeetingBookingOwnerRepository = {
      get: vi
        .fn()
        .mockImplementation(async () => ({ id: MEETING_ID, ...store })),
      assignUnassignedBookedBy: vi
        .fn()
        .mockImplementation(async ({ bookedById }) => {
          if (store.bookedById) return store.bookedById === bookedById;
          store.bookedById = bookedById;
          return true;
        }),
    };
    const input = {
      meetingId: MEETING_ID,
      creatorWorkspaceMemberId: MEMBER_ID,
      meetingRepository: meetings,
    };

    await expect(assignMeetingBookingOwner(input)).resolves.toMatchObject({
      bookedByAssigned: true,
    });
    await expect(assignMeetingBookingOwner(input)).resolves.toMatchObject({
      bookedByAssigned: false,
    });
    expect(meetings.assignUnassignedBookedBy).toHaveBeenCalledTimes(1);
    expect(store.bookedById).toBe(MEMBER_ID);
  });
});
