import { deterministicCorgiUuid } from 'src/modules/core/deterministic-uuid';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const TITLE_LIMIT = 120;

export type FollowUpSource = {
  id: string;
  followUpDate: string | null;
  followUpTaskId: string | null;
  companyId: string | null;
  wholesalerId: string | null;
  notes: string | null;
};

export type FollowUpTaskRepository = {
  getFollowUpSource(activityId: string): Promise<FollowUpSource | null>;
  findAssigneeForWholesaler(wholesalerId: string): Promise<string | null>;
  createTask(input: {
    id: string;
    title: string;
    dueAt: string;
    assigneeId: string;
    wholesalerId: string;
  }): Promise<{ id: string }>;
  linkTaskToCompany(input: { taskId: string; companyId: string }): Promise<void>;
  attachTaskToActivity(input: {
    activityId: string;
    taskId: string;
  }): Promise<boolean>;
};

export const FOLLOW_UP_TASK_SKIP_REASONS = [
  'activity_not_found',
  'no_follow_up_date',
  'already_linked',
  'owner_has_no_workspace_member',
] as const;

export type FollowUpTaskSkipReason =
  (typeof FOLLOW_UP_TASK_SKIP_REASONS)[number];

export type CreateFollowUpTaskResult =
  | { status: 'created'; activityId: string; taskId: string }
  | {
      status: 'skipped';
      activityId: string;
      reason: FollowUpTaskSkipReason;
    };

// The task id is derived from the activity, so a re-delivered create event
// rewrites the same row instead of adding a second identical follow-up.
export const followUpTaskIdFor = (activityId: string) =>
  deterministicCorgiUuid('outreach-follow-up-task', activityId);

const titleFrom = (notes: string | null) => {
  const firstLine = (notes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return 'Follow up';
  return firstLine.length > TITLE_LIMIT
    ? `${firstLine.slice(0, TITLE_LIMIT - 1).trimEnd()}…`
    : firstLine;
};

export const createFollowUpTask = async ({
  activityId,
  repository,
}: {
  activityId: string;
  repository: FollowUpTaskRepository;
}): Promise<CreateFollowUpTaskResult> => {
  const source = await repository.getFollowUpSource(activityId);
  if (!source) {
    return { status: 'skipped', activityId, reason: 'activity_not_found' };
  }
  if (!source.followUpDate || !DATE_PATTERN.test(source.followUpDate)) {
    return { status: 'skipped', activityId, reason: 'no_follow_up_date' };
  }
  // Read the live link rather than the event: someone may have attached a task
  // by hand between the activity being written and this running.
  if (source.followUpTaskId) {
    return { status: 'skipped', activityId, reason: 'already_linked' };
  }

  const assigneeId =
    source.wholesalerId && UUID_PATTERN.test(source.wholesalerId)
      ? await repository.findAssigneeForWholesaler(source.wholesalerId)
      : null;
  // An unassigned task is invisible in the only place anyone looks for it, so
  // creating one would reproduce the problem this exists to fix. The follow-up
  // date stays on the activity either way, so nothing is lost by refusing.
  if (!assigneeId || !UUID_PATTERN.test(assigneeId)) {
    return {
      status: 'skipped',
      activityId,
      reason: 'owner_has_no_workspace_member',
    };
  }

  const taskId = followUpTaskIdFor(activityId);
  await repository.createTask({
    id: taskId,
    title: titleFrom(source.notes),
    dueAt: `${source.followUpDate.slice(0, 10)}T00:00:00.000Z`,
    assigneeId,
    // The task carries the same ownership as the activity that produced it,
    // so it counts for the same person everywhere the CRM groups by owner.
    wholesalerId: source.wholesalerId!,
  });
  if (source.companyId && UUID_PATTERN.test(source.companyId)) {
    await repository.linkTaskToCompany({ taskId, companyId: source.companyId });
  }
  if (!(await repository.attachTaskToActivity({ activityId, taskId }))) {
    // Without the back-link the next delivery would create a second task, so
    // an unattached task is a failure rather than a partial success.
    throw new Error('Follow-up task was created but not linked to its activity');
  }
  return { status: 'created', activityId, taskId };
};
