import { describe, expect, it } from 'vitest';
import { CoreFollowUpRepository } from './core-follow-up.repository';
import { reconcileFollowUp } from '../services/reconcile-follow-up.service';
type Row = Record<string, unknown>;
const actor = '11111111-1111-4111-8111-111111111111';
const wholesaler = '22222222-2222-4222-8222-222222222222';
const matches = (row: Row, filter: Row): boolean =>
  Object.entries(filter).every(([key, value]) => {
    if (key === 'and')
      return (value as Row[]).every((child) => matches(row, child));
    if (key === 'or')
      return (value as Row[]).some((child) => matches(row, child));
    const predicate = value as Row;
    if ('eq' in predicate) return row[key] === predicate.eq;
    if ('is' in predicate) return row[key] === null || row[key] === undefined;
    return false;
  });
const store = () => {
  const rows: Record<string, Map<string, Row>> = {
    outreachActivities: new Map([
      [
        'activity',
        {
          id: 'activity',
          followUpDate: '2026-11-01',
          companyId: 'company',
          contactId: null,
          notes: 'Call back',
          company: { name: 'Acme' },
          assignmentId: 'another-persons-assignment',
          followUpTaskId: null,
          followUpValidationMessage: null,
        },
      ],
    ]),
    wholesalers: new Map([
      [wholesaler, { id: wholesaler, workspaceMemberId: actor }],
    ]),
    outreachFollowUps: new Map(),
    leadAssignments: new Map(),
    tasks: new Map(),
    taskTargets: new Map(),
  };
  let revision = 0;
  let loseResponseFor: string | null = null;
  const request = async ({
    operationName,
    document,
    variables,
  }: {
    operationName: string;
    document: string;
    variables: Row;
  }) => {
    const field = document.match(/\{\s*(\w+)\(/)?.[1];
    if (!field) throw new Error('unparsed operation');
    if (operationName === 'CorgiFollowUpRead')
      return {
        [field]: {
          edges: [...rows[field]!.values()]
            .filter((row) => matches(row, variables.filter as Row))
            .map((node) => ({ node })),
        },
      };
    const object = field.replace(/^(create|update)/, '');
    const singular = object[0]!.toLowerCase() + object.slice(1);
    const plural = field.startsWith('create')
      ? singular.endsWith('y')
        ? singular.slice(0, -1) + 'ies'
        : singular + 's'
      : singular;
    const table = rows[plural]!;
    const data = variables.data as Row;
    if (field.startsWith('create')) {
      if (table.has(data.id as string)) throw new Error('unique violation');
      const record = { ...data, updatedAt: `revision-${++revision}` };
      table.set(data.id as string, record);
      if (loseResponseFor === plural) {
        loseResponseFor = null;
        throw new Error('response lost');
      }
      return { [field]: record };
    }
    const updated: Row[] = [];
    for (const [id, row] of table) {
      if (matches(row, variables.filter as Row)) {
        const next = { ...row, ...data, updatedAt: `revision-${++revision}` };
        table.set(id, next);
        updated.push(next);
      }
    }
    return { [field]: updated };
  };
  return {
    rows,
    repository: new CoreFollowUpRepository({ request } as never),
    loseNext: (table: string) => {
      loseResponseFor = table;
    },
  };
};
describe('follow-up persistence recovery', () => {
  it.each(['outreachFollowUps', 'leadAssignments', 'tasks', 'taskTargets'])(
    'confirms a committed %s create after losing its response and never duplicates on replay',
    async (table) => {
      const fixture = store();
      fixture.loseNext(table);
      const input = {
        activityId: 'activity',
        actorWorkspaceMemberId: actor,
        eventAt: '2026-10-05T12:00:00Z',
        repository: fixture.repository,
      };
      await reconcileFollowUp(input);
      await reconcileFollowUp(input);
      for (const table of [
        'outreachFollowUps',
        'leadAssignments',
        'tasks',
        'taskTargets',
      ])
        expect(fixture.rows[table]!.size).toBe(1);
      expect(
        fixture.rows.outreachActivities!.get('activity')!.assignmentId,
      ).toBe('another-persons-assignment');
      expect([...fixture.rows.tasks!.values()][0]).toMatchObject({
        assigneeId: actor,
        wholesalerId: wholesaler,
        dueAt: '2026-11-01T05:00:00.000Z',
      });
    },
  );
  it('completes a reminder through its task and preserves scheduler attribution on reassignment', async () => {
    const fixture = store();
    await reconcileFollowUp({
      activityId: 'activity',
      actorWorkspaceMemberId: actor,
      eventAt: '2026-10-05T12:00:00Z',
      repository: fixture.repository,
    });
    const task = [...fixture.rows.tasks!.values()][0]!;
    task.status = 'DONE';
    await fixture.repository.synchronizeTaskStatus(task.id as string);
    const reminder = [...fixture.rows.outreachFollowUps!.values()][0]!;
    expect(reminder.status).toBe('COMPLETED');
    expect(reminder.scheduledById).toBe(actor);
    fixture.rows.wholesalers!.set('new-wholesaler', {
      id: 'new-wholesaler',
      workspaceMemberId: 'new-assignee',
    });
    reminder.assigneeId = 'new-assignee';
    await fixture.repository.synchronizeReminder(reminder.id as string);
    expect([...fixture.rows.tasks!.values()][0]!.assigneeId).toBe(
      'new-assignee',
    );
    expect(reminder.scheduledById).toBe(actor);
  });
  it('does not reopen a task completed before its delayed scheduling replay', async () => {
    const fixture = store();
    await reconcileFollowUp({
      activityId: 'activity',
      actorWorkspaceMemberId: actor,
      eventAt: '2026-10-05T12:00:00Z',
      repository: fixture.repository,
    });
    const reminder = { ...[...fixture.rows.outreachFollowUps!.values()][0]! };
    const task = [...fixture.rows.tasks!.values()][0]!;
    task.status = 'DONE';
    await expect(
      fixture.repository.ensureTask(reminder as never),
    ).rejects.toThrow('completed');
    expect([...fixture.rows.tasks!.values()][0]!.status).toBe('DONE');
    expect([...fixture.rows.outreachFollowUps!.values()][0]!.status).toBe(
      'COMPLETED',
    );
  });
  it('relinks only its own task target when the company changes', async () => {
    const fixture = store();
    const input = {
      activityId: 'activity',
      actorWorkspaceMemberId: actor,
      eventAt: '2026-10-05T12:00:00Z',
      repository: fixture.repository,
    };
    await reconcileFollowUp(input);
    fixture.rows.outreachActivities!.get('activity')!.companyId = 'new-company';
    await reconcileFollowUp(input);
    expect(fixture.rows.taskTargets!.size).toBe(1);
    expect([...fixture.rows.taskTargets!.values()][0]!.targetCompanyId).toBe(
      'new-company',
    );
    expect(fixture.rows.leadAssignments!.size).toBe(2);
  });
});
