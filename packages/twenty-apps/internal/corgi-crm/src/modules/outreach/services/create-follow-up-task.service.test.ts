import { describe, expect, it, vi } from 'vitest';

import {
  createFollowUpTask,
  followUpTaskIdFor,
  type FollowUpSource,
  type FollowUpTaskRepository,
} from 'src/modules/outreach/services/create-follow-up-task.service';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const ACTIVITY_ID = uuid('1');
const COMPANY_ID = uuid('2');
const WHOLESALER_ID = uuid('3');
const MEMBER_ID = uuid('4');

const source = (overrides: Partial<FollowUpSource> = {}): FollowUpSource => ({
  id: ACTIVITY_ID,
  followUpDate: '2026-09-18',
  followUpTaskId: null,
  companyId: COMPANY_ID,
  wholesalerId: WHOLESALER_ID,
  notes: 'Left VM, call back Thursday',
  ...overrides,
});

const repository = (
  overrides: Partial<FollowUpTaskRepository> = {},
  record: FollowUpSource | null = source(),
): FollowUpTaskRepository => ({
  getFollowUpSource: vi.fn().mockResolvedValue(record),
  findAssigneeForWholesaler: vi.fn().mockResolvedValue(MEMBER_ID),
  createTask: vi.fn().mockImplementation(async ({ id }) => ({ id })),
  linkTaskToCompany: vi.fn().mockResolvedValue(undefined),
  attachTaskToActivity: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe('createFollowUpTask', () => {
  it('creates the task assigned to the activity owner, due on the follow-up date', async () => {
    const repo = repository();

    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).resolves.toEqual({
      status: 'created',
      activityId: ACTIVITY_ID,
      taskId: followUpTaskIdFor(ACTIVITY_ID),
    });
    expect(repo.createTask).toHaveBeenCalledWith({
      id: followUpTaskIdFor(ACTIVITY_ID),
      title: 'Left VM, call back Thursday',
      dueAt: '2026-09-18T00:00:00.000Z',
      assigneeId: MEMBER_ID,
      wholesalerId: WHOLESALER_ID,
    });
    expect(repo.linkTaskToCompany).toHaveBeenCalledWith({
      taskId: followUpTaskIdFor(ACTIVITY_ID),
      companyId: COMPANY_ID,
    });
    expect(repo.attachTaskToActivity).toHaveBeenCalled();
  });

  // An unassigned task is invisible in the only place anyone looks for it.
  it('refuses rather than creating a task nobody would see', async () => {
    const repo = repository({
      findAssigneeForWholesaler: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).resolves.toMatchObject({
      status: 'skipped',
      reason: 'owner_has_no_workspace_member',
    });
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it.each([
    ['no follow-up date', { followUpDate: null }, 'no_follow_up_date'],
    ['a malformed follow-up date', { followUpDate: 'soon' }, 'no_follow_up_date'],
    ['a task already attached', { followUpTaskId: uuid('9') }, 'already_linked'],
  ])('skips %s without writing', async (_n, overrides, reason) => {
    const repo = repository({}, source(overrides));

    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).resolves.toMatchObject({ status: 'skipped', reason });
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it('skips an activity that no longer exists', async () => {
    const repo = repository({}, null);
    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).resolves.toMatchObject({ status: 'skipped', reason: 'activity_not_found' });
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it('still creates the task when the activity has no company to link', async () => {
    const repo = repository({}, source({ companyId: null }));

    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).resolves.toMatchObject({ status: 'created' });
    expect(repo.linkTaskToCompany).not.toHaveBeenCalled();
  });

  it('falls back to a generic title when the activity carries no notes', async () => {
    const repo = repository({}, source({ notes: '   \n  ' }));
    await createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo });
    expect(repo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Follow up' }),
    );
  });

  it('truncates a long note rather than making an unreadable title', async () => {
    const repo = repository({}, source({ notes: 'x'.repeat(400) }));
    await createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo });
    const title = vi.mocked(repo.createTask).mock.calls[0]![0].title;
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith('…')).toBe(true);
  });

  // Losing the back-link would make the next delivery create a second task.
  it('raises when the task cannot be linked back to its activity', async () => {
    const repo = repository({
      attachTaskToActivity: vi.fn().mockResolvedValue(false),
    });
    await expect(
      createFollowUpTask({ activityId: ACTIVITY_ID, repository: repo }),
    ).rejects.toThrow(/not linked to its activity/);
  });

  it('derives the same task id for the same activity, and different ids across activities', () => {
    expect(followUpTaskIdFor(ACTIVITY_ID)).toBe(followUpTaskIdFor(ACTIVITY_ID));
    expect(followUpTaskIdFor(ACTIVITY_ID)).not.toBe(followUpTaskIdFor(uuid('8')));
    expect(followUpTaskIdFor(ACTIVITY_ID)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
