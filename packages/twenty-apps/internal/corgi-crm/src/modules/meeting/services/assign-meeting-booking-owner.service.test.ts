import { describe, expect, it, vi } from 'vitest';

import {
  assignMeetingBookingOwner,
  type MeetingBookingOwner,
  type MeetingBookingOwnerRepository,
} from 'src/modules/meeting/services/assign-meeting-booking-owner.service';
import { type WholesalerRecord } from 'src/modules/wholesaler/onboarding/types';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const WHOLESALER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_WHOLESALER_ID = '55555555-5555-4555-8555-555555555555';

const creatorWholesaler: WholesalerRecord = {
  id: WHOLESALER_ID,
  name: 'Dana Wholesaler',
  email: 'dana@corgi.com',
  wholesalerRole: 'Wholesaler',
  workspaceMemberId: MEMBER_ID,
};

const meetingRepository = ({
  owners = [{ id: MEETING_ID, wholesalerId: null, bookedById: null }],
  assigned = true,
  bookedByAssigned = true,
}: {
  owners?: Array<MeetingBookingOwner | null>;
  assigned?: boolean;
  bookedByAssigned?: boolean;
} = {}): MeetingBookingOwnerRepository => {
  const queue = [...owners];
  return {
    get: vi
      .fn()
      .mockImplementation(async () =>
        queue.length > 1 ? queue.shift()! : queue[0]!,
      ),
    assignUnassignedOwner: vi.fn().mockResolvedValue(assigned),
    assignUnassignedBookedBy: vi.fn().mockResolvedValue(bookedByAssigned),
  };
};

const wholesalerRepository = (records: WholesalerRecord[]) => ({
  findByWorkspaceMemberId: vi.fn().mockResolvedValue(records),
});

describe('assignMeetingBookingOwner', () => {
  it('assigns an unowned meeting to the wholesaler of its creator', async () => {
    const meetings = meetingRepository();
    const wholesalers = wholesalerRepository([creatorWholesaler]);

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalers,
      }),
    ).resolves.toEqual({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
      bookedByAssigned: true,
    });
    expect(wholesalers.findByWorkspaceMemberId).toHaveBeenCalledWith(MEMBER_ID);
    expect(meetings.assignUnassignedOwner).toHaveBeenCalledWith({
      id: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
    });
  });

  it('never replaces a wholesaler that was already selected', async () => {
    const meetings = meetingRepository({
      owners: [{ id: MEETING_ID, wholesalerId: OTHER_WHOLESALER_ID, bookedById: null }],
    });
    const wholesalers = wholesalerRepository([creatorWholesaler]);

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalers,
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'already_assigned',
      bookedByAssigned: true,
    });
    expect(meetings.assignUnassignedOwner).not.toHaveBeenCalled();
    expect(wholesalers.findByWorkspaceMemberId).not.toHaveBeenCalled();
  });

  it('reads the live owner rather than trusting a stale create event', async () => {
    // The create event said the slot was empty; by delivery someone had chosen.
    const meetings = meetingRepository({
      owners: [{ id: MEETING_ID, wholesalerId: OTHER_WHOLESALER_ID, bookedById: null }],
    });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'already_assigned',
      bookedByAssigned: true,
    });
    expect(meetings.get).toHaveBeenCalledWith(MEETING_ID);
  });

  it('leaves the meeting alone when its creator has no wholesaler record', async () => {
    const meetings = meetingRepository();

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'creator_has_no_wholesaler',
      bookedByAssigned: true,
    });
    expect(meetings.assignUnassignedOwner).not.toHaveBeenCalled();
  });

  it('ignores a wholesaler that is linked to a different member', async () => {
    const meetings = meetingRepository();

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([
          { ...creatorWholesaler, workspaceMemberId: OTHER_WHOLESALER_ID },
        ]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'creator_has_no_wholesaler',
      bookedByAssigned: true,
    });
    expect(meetings.assignUnassignedOwner).not.toHaveBeenCalled();
  });

  it('fails closed when the creator is linked to more than one wholesaler', async () => {
    const meetings = meetingRepository();

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([
          creatorWholesaler,
          { ...creatorWholesaler, id: OTHER_WHOLESALER_ID },
        ]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'ambiguous_creator_wholesaler',
      bookedByAssigned: true,
    });
    expect(meetings.assignUnassignedOwner).not.toHaveBeenCalled();
  });

  it.each([null, '', 'not-a-uuid'])(
    'skips an unresolvable creator identity (%s)',
    async (creatorWorkspaceMemberId) => {
      const meetings = meetingRepository();
      const wholesalers = wholesalerRepository([creatorWholesaler]);

      await expect(
        assignMeetingBookingOwner({
          meetingId: MEETING_ID,
          creatorWorkspaceMemberId,
          meetingRepository: meetings,
          wholesalerRepository: wholesalers,
        }),
      ).resolves.toEqual({
        status: 'skipped',
        meetingId: MEETING_ID,
        reason: 'unknown_creator',
      bookedByAssigned: false,
    });
      expect(wholesalers.findByWorkspaceMemberId).not.toHaveBeenCalled();
    },
  );

  it('skips a meeting that no longer exists', async () => {
    const meetings = meetingRepository({ owners: [null] });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'meeting_not_found',
      bookedByAssigned: false,
    });
    expect(meetings.assignUnassignedOwner).not.toHaveBeenCalled();
  });

  it('is idempotent across a re-delivered create event', async () => {
    const store = {
      wholesalerId: null as string | null,
      bookedById: null as string | null,
    };
    const meetings: MeetingBookingOwnerRepository = {
      get: vi
        .fn()
        .mockImplementation(async () => ({ id: MEETING_ID, ...store })),
      assignUnassignedOwner: vi
        .fn()
        .mockImplementation(async ({ wholesalerId }) => {
          if (store.wholesalerId) return store.wholesalerId === wholesalerId;
          store.wholesalerId = wholesalerId;
          return true;
        }),
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
      wholesalerRepository: wholesalerRepository([creatorWholesaler]),
    };

    await expect(assignMeetingBookingOwner(input)).resolves.toEqual({
      status: 'assigned',
      meetingId: MEETING_ID,
      wholesalerId: WHOLESALER_ID,
      bookedByAssigned: true,
    });
    // The redelivery re-claims neither value: both are already set.
    await expect(assignMeetingBookingOwner(input)).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'already_assigned',
      bookedByAssigned: false,
    });
    expect(meetings.assignUnassignedOwner).toHaveBeenCalledTimes(1);
    expect(meetings.assignUnassignedBookedBy).toHaveBeenCalledTimes(1);
    expect(store.wholesalerId).toBe(WHOLESALER_ID);
    expect(store.bookedById).toBe(MEMBER_ID);
  });

  it('accepts a concurrent explicit owner that won the empty slot', async () => {
    const meetings = meetingRepository({
      owners: [
        { id: MEETING_ID, wholesalerId: null, bookedById: null },
        { id: MEETING_ID, wholesalerId: OTHER_WHOLESALER_ID, bookedById: null },
      ],
      assigned: false,
    });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      meetingId: MEETING_ID,
      reason: 'already_assigned',
      bookedByAssigned: true,
    });
  });

  it('raises a retryable fault when the assignment did not persist', async () => {
    const meetings = meetingRepository({ assigned: false });

    await expect(
      assignMeetingBookingOwner({
        meetingId: MEETING_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        meetingRepository: meetings,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).rejects.toThrow('did not persist');
  });
});
