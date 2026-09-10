import { describe, expect, it, vi } from 'vitest';

import { assignOutreachActivityOwner } from 'src/modules/outreach/services/assign-outreach-activity-owner.service';
import {
  type OutreachActivityOwner,
  type OutreachActivityOwnerRepository,
} from 'src/modules/outreach/types';
import { type WholesalerRecord } from 'src/modules/wholesaler/onboarding/types';

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
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

const activityRepository = ({
  owners = [{ id: ACTIVITY_ID, wholesalerId: null }],
  assigned = true,
}: {
  owners?: Array<OutreachActivityOwner | null>;
  assigned?: boolean;
} = {}): OutreachActivityOwnerRepository => {
  const queue = [...owners];
  return {
    getActivityOwner: vi
      .fn()
      .mockImplementation(async () =>
        queue.length > 1 ? queue.shift()! : queue[0]!,
      ),
    assignUnassignedActivityOwner: vi.fn().mockResolvedValue(assigned),
  };
};

const wholesalerRepository = (records: WholesalerRecord[]) => ({
  findByWorkspaceMemberId: vi.fn().mockResolvedValue(records),
});

describe('assignOutreachActivityOwner', () => {
  it('assigns an unowned activity to the wholesaler of its creator', async () => {
    const activities = activityRepository();
    const wholesalers = wholesalerRepository([creatorWholesaler]);

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalers,
      }),
    ).resolves.toEqual({
      status: 'assigned',
      activityId: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });
    expect(wholesalers.findByWorkspaceMemberId).toHaveBeenCalledWith(MEMBER_ID);
    expect(activities.assignUnassignedActivityOwner).toHaveBeenCalledWith({
      id: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });
  });

  it('never replaces a wholesaler that was already selected', async () => {
    const activities = activityRepository({
      owners: [{ id: ACTIVITY_ID, wholesalerId: OTHER_WHOLESALER_ID }],
    });
    const wholesalers = wholesalerRepository([creatorWholesaler]);

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalers,
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'already_assigned',
    });
    expect(activities.assignUnassignedActivityOwner).not.toHaveBeenCalled();
    expect(wholesalers.findByWorkspaceMemberId).not.toHaveBeenCalled();
  });

  it('leaves the activity alone when its creator has no wholesaler record', async () => {
    const activities = activityRepository();

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'creator_has_no_wholesaler',
    });
    expect(activities.assignUnassignedActivityOwner).not.toHaveBeenCalled();
  });

  it('ignores a wholesaler that is linked to a different member', async () => {
    const activities = activityRepository();

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([
          { ...creatorWholesaler, workspaceMemberId: OTHER_WHOLESALER_ID },
        ]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'creator_has_no_wholesaler',
    });
    expect(activities.assignUnassignedActivityOwner).not.toHaveBeenCalled();
  });

  it('fails closed when the creator is linked to more than one wholesaler', async () => {
    const activities = activityRepository();

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([
          creatorWholesaler,
          { ...creatorWholesaler, id: OTHER_WHOLESALER_ID },
        ]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'ambiguous_creator_wholesaler',
    });
    expect(activities.assignUnassignedActivityOwner).not.toHaveBeenCalled();
  });

  it.each([null, '', 'not-a-uuid'])(
    'skips an unresolvable creator identity (%s)',
    async (creatorWorkspaceMemberId) => {
      const activities = activityRepository();
      const wholesalers = wholesalerRepository([creatorWholesaler]);

      await expect(
        assignOutreachActivityOwner({
          activityId: ACTIVITY_ID,
          creatorWorkspaceMemberId,
          activityRepository: activities,
          wholesalerRepository: wholesalers,
        }),
      ).resolves.toEqual({
        status: 'skipped',
        activityId: ACTIVITY_ID,
        reason: 'unknown_creator',
      });
      expect(wholesalers.findByWorkspaceMemberId).not.toHaveBeenCalled();
    },
  );

  it('skips an activity that no longer exists', async () => {
    const activities = activityRepository({ owners: [null] });

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'activity_not_found',
    });
    expect(activities.assignUnassignedActivityOwner).not.toHaveBeenCalled();
  });

  it('is idempotent across a re-delivered create event', async () => {
    const owner: OutreachActivityOwner = {
      id: ACTIVITY_ID,
      wholesalerId: null,
    };
    const store = { wholesalerId: null as string | null };
    const activities: OutreachActivityOwnerRepository = {
      getActivityOwner: vi
        .fn()
        .mockImplementation(async () => ({ ...owner, ...store })),
      assignUnassignedActivityOwner: vi
        .fn()
        .mockImplementation(async ({ wholesalerId }) => {
          if (store.wholesalerId) return store.wholesalerId === wholesalerId;
          store.wholesalerId = wholesalerId;
          return true;
        }),
    };
    const input = {
      activityId: ACTIVITY_ID,
      creatorWorkspaceMemberId: MEMBER_ID,
      activityRepository: activities,
      wholesalerRepository: wholesalerRepository([creatorWholesaler]),
    };

    await expect(assignOutreachActivityOwner(input)).resolves.toEqual({
      status: 'assigned',
      activityId: ACTIVITY_ID,
      wholesalerId: WHOLESALER_ID,
    });
    await expect(assignOutreachActivityOwner(input)).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'already_assigned',
    });
    expect(activities.assignUnassignedActivityOwner).toHaveBeenCalledTimes(1);
    expect(store.wholesalerId).toBe(WHOLESALER_ID);
  });

  it('accepts a concurrent explicit owner that won the empty slot', async () => {
    const activities = activityRepository({
      owners: [
        { id: ACTIVITY_ID, wholesalerId: null },
        { id: ACTIVITY_ID, wholesalerId: OTHER_WHOLESALER_ID },
      ],
      assigned: false,
    });

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).resolves.toEqual({
      status: 'skipped',
      activityId: ACTIVITY_ID,
      reason: 'already_assigned',
    });
  });

  it('raises a retryable fault when the assignment did not persist', async () => {
    const activities = activityRepository({ assigned: false });

    await expect(
      assignOutreachActivityOwner({
        activityId: ACTIVITY_ID,
        creatorWorkspaceMemberId: MEMBER_ID,
        activityRepository: activities,
        wholesalerRepository: wholesalerRepository([creatorWholesaler]),
      }),
    ).rejects.toThrow('did not persist');
  });
});
