import { getZonedDayWindow } from 'src/modules/outreach/services/day-window.service';
import { deterministicCorgiUuid } from 'src/modules/core/deterministic-uuid';

export type FollowUpStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type FollowUpActivity = {
  id: string;
  followUpRequestKey?: string | null;
  followUpDate: string | null;
  companyId: string | null;
  contactId: string | null;
  notes: string | null;
  companyName: string | null;
  assignmentId: string | null;
};
export type FollowUpRecord = {
  id: string;
  name: string;
  occurrenceKey: string;
  activityId: string;
  companyId: string | null;
  contactId: string | null;
  scheduledById: string;
  assigneeId: string;
  wholesalerId: string;
  scheduledAt: string;
  dueAt: string;
  status: FollowUpStatus;
  assignmentId: string | null;
  taskId: string;
};
export type FollowUpRepository = {
  getActivity(id: string): Promise<FollowUpActivity | null>;
  findOccurrence(key: string): Promise<FollowUpRecord | null>;
  findOpen(activityId: string): Promise<FollowUpRecord | null>;
  findActorWholesalers(
    workspaceMemberId: string,
  ): Promise<{ id: string; workspaceMemberId: string }[]>;
  findOpenAssignment(input: {
    companyId: string;
    contactId: string | null;
    wholesalerId: string;
  }): Promise<string | null>;
  ensureAssignment(input: {
    id: string;
    name: string;
    companyId: string;
    contactId: string | null;
    wholesalerId: string;
    assignedAt: string;
  }): Promise<void>;
  saveFollowUp(record: FollowUpRecord): Promise<void>;
  ensureTask(record: FollowUpRecord): Promise<void>;
  ensureTarget(record: FollowUpRecord): Promise<void>;
  attachBacklinks(record: FollowUpRecord): Promise<void>;
  setValidation(activityId: string, message: string | null): Promise<void>;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dueAtFor = (date: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(date)) return null;
  const day = date.slice(0, 10);
  const instant = new Date(`${day}T12:00:00.000Z`);
  return Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === day
    ? getZonedDayWindow({
        now: instant,
        timeZone: 'America/Chicago',
      }).start.toISOString()
    : null;
};

export const reconcileFollowUp = async ({
  activityId,
  actorWorkspaceMemberId,
  eventAt,
  expectedRequestKey,
  expectedFollowUpDate,
  allowCreate = true,
  repository,
}: {
  activityId: string;
  actorWorkspaceMemberId: string | null;
  eventAt: string;
  expectedRequestKey?: string | null;
  expectedFollowUpDate?: string | null;
  allowCreate?: boolean;
  repository: FollowUpRepository;
}) => {
  const source = await repository.getActivity(activityId);
  if (!source) return { status: 'missing' } as const;
  if (
    (expectedRequestKey !== undefined &&
      expectedRequestKey !== (source.followUpRequestKey ?? null)) ||
    (expectedFollowUpDate !== undefined &&
      expectedFollowUpDate !== source.followUpDate)
  )
    return { status: 'stale' } as const;
  if (source.followUpDate && !Number.isFinite(Date.parse(eventAt)))
    throw new Error('Follow-up event timestamp is invalid');
  const occurrenceKey = `${activityId}:${source.followUpRequestKey || eventAt}`;
  const replay = await repository.findOccurrence(occurrenceKey);
  const existing = replay ?? (await repository.findOpen(activityId));
  if (!source.followUpDate) {
    if (existing?.status === 'OPEN') {
      const cancelled = { ...existing, status: 'CANCELLED' as const };
      await repository.saveFollowUp(cancelled);
      await repository.ensureTask(cancelled);
    }
    return { status: 'cancelled' } as const;
  }
  const dueAt = dueAtFor(source.followUpDate);
  if (!dueAt) {
    await repository.setValidation(
      activityId,
      'Choose a valid follow-up date.',
    );
    return { status: 'invalid', reason: 'invalid_date' } as const;
  }
  // Event time is the request identity. Replayed events cannot reopen a finished
  // occurrence; a deliberate new request receives a different event identity.
  if (replay && replay.status !== 'OPEN')
    return { status: 'unchanged', followUpId: replay.id } as const;
  let record = existing;
  if (!record) {
    if (!allowCreate) return { status: 'unchanged' } as const;
    const matches =
      actorWorkspaceMemberId && UUID.test(actorWorkspaceMemberId)
        ? (
            await repository.findActorWholesalers(actorWorkspaceMemberId)
          ).filter(
            (value) => value.workspaceMemberId === actorWorkspaceMemberId,
          )
        : [];
    if (matches.length !== 1) {
      await repository.setValidation(
        activityId,
        'Your workspace member must map to exactly one Wholesaler before scheduling a follow-up.',
      );
      return { status: 'invalid', reason: 'scheduler_identity' } as const;
    }
    const id = deterministicCorgiUuid('outreach-follow-up', occurrenceKey);
    record = {
      id,
      name: 'Follow up',
      occurrenceKey,
      activityId,
      companyId: source.companyId,
      contactId: source.contactId,
      scheduledById: actorWorkspaceMemberId!,
      assigneeId: actorWorkspaceMemberId!,
      wholesalerId: matches[0]!.id,
      scheduledAt: eventAt,
      dueAt,
      status: 'OPEN',
      assignmentId: null,
      taskId: deterministicCorgiUuid('outreach-follow-up-task', id),
    };
    // Persist scheduler provenance before downstream work so a later editor or
    // retry cannot become the apparent scheduler after a partial failure.
    await repository.saveFollowUp(record);
  }
  const associationChanged =
    record.companyId !== source.companyId ||
    record.contactId !== source.contactId;
  record = {
    ...record,
    assignmentId: associationChanged ? null : record.assignmentId,
    companyId: source.companyId,
    contactId: source.contactId,
    dueAt,
    name: (
      source.notes?.trim().split('\n')[0] ||
      `Follow up - ${source.companyName || 'Company not linked'}`
    ).slice(0, 240),
  };
  if (record.companyId && !record.assignmentId) {
    const assignmentId =
      (await repository.findOpenAssignment({
        companyId: record.companyId,
        contactId: record.contactId,
        wholesalerId: record.wholesalerId,
      })) ??
      deterministicCorgiUuid(
        'outreach-follow-up-assignment',
        `${record.id}:${record.companyId}:${record.contactId ?? ''}`,
      );
    await repository.ensureAssignment({
      id: assignmentId,
      name: `Follow up - ${source.companyName || 'Company'}`,
      companyId: record.companyId,
      contactId: record.contactId,
      wholesalerId: record.wholesalerId,
      assignedAt: record.scheduledAt,
    });
    record = { ...record, assignmentId };
    await repository.saveFollowUp(record);
  }
  await repository.ensureTask(record);
  await repository.ensureTarget(record);
  await repository.attachBacklinks(record);
  await repository.saveFollowUp(record);
  await repository.setValidation(
    activityId,
    record.companyId
      ? null
      : 'Link a company to create the Lead Assignment. Your reminder remains in Needs company link.',
  );
  return {
    status: 'scheduled',
    followUpId: record.id,
    taskId: record.taskId,
    assignmentId: record.assignmentId,
  } as const;
};
