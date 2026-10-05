import { describe, expect, it } from 'vitest';
import {
  reconcileFollowUp,
  type FollowUpRepository,
  type FollowUpRecord,
  type FollowUpActivity,
} from './reconcile-follow-up.service';
const actor = '11111111-1111-4111-8111-111111111111';
const wholesaler = '22222222-2222-4222-8222-222222222222';
const createStore = () => {
  const source: FollowUpActivity = {
    id: 'a',
    followUpDate: '2026-12-20',
    companyId: 'c',
    contactId: 'p',
    notes: 'Call about allocation',
    companyName: 'Company',
    assignmentId: 'someone-elses-assignment',
  };
  const records = new Map<string, FollowUpRecord>();
  const assignments = new Set<string>();
  const tasks = new Map<string, FollowUpRecord>();
  const targets = new Set<string>();
  let failure: string | null = null;
  const fail = (step: string) => {
    if (failure === step) {
      failure = null;
      throw new Error('injected ' + step);
    }
  };
  const repo: FollowUpRepository = {
    getActivity: async () => source,
    findOccurrence: async (key) =>
      [...records.values()].find((row) => row.occurrenceKey === key) ?? null,
    findOpen: async () =>
      [...records.values()].find((row) => row.status === 'OPEN') ?? null,
    findActorWholesalers: async (id) => [
      { id: wholesaler, workspaceMemberId: id },
    ],
    findOpenAssignment: async () => null,
    ensureAssignment: async (row) => {
      assignments.add(row.id);
      fail('assignment');
    },
    saveFollowUp: async (row) => {
      records.set(row.id, { ...row });
    },
    ensureTask: async (row) => {
      tasks.set(row.taskId, { ...row });
      fail('task');
    },
    ensureTarget: async (row) => {
      targets.add(row.taskId);
      fail('target');
    },
    attachBacklinks: async () => {
      fail('backlink');
    },
    setValidation: async () => {},
  };
  const run = () =>
    reconcileFollowUp({
      activityId: 'a',
      actorWorkspaceMemberId: actor,
      eventAt: '2026-10-05T13:00:00Z',
      repository: repo,
    });
  return {
    source,
    records,
    assignments,
    tasks,
    targets,
    repo,
    run,
    setFailure: (step: string) => {
      failure = step;
    },
  };
};
describe('follow-up reconciliation', () => {
  it.each(['assignment', 'task', 'target', 'backlink'])(
    'recovers after a committed %s without duplicate work',
    async (step) => {
      const store = createStore();
      store.setFailure(step);
      await expect(store.run()).rejects.toThrow('injected');
      await store.run();
      await store.run();
      expect(store.assignments.size).toBe(1);
      expect(store.tasks.size).toBe(1);
      expect(store.targets.size).toBe(1);
      expect(store.records.size).toBe(1);
      expect([...store.records.values()][0]).toMatchObject({
        scheduledById: actor,
        assigneeId: actor,
        wholesalerId: wholesaler,
      });
      expect(store.source.assignmentId).toBe('someone-elses-assignment');
    },
  );
  it('reschedules the same reminder without changing who flagged it', async () => {
    const store = createStore();
    await store.run();
    store.source.followUpDate = '2027-01-02';
    await reconcileFollowUp({
      activityId: 'a',
      actorWorkspaceMemberId: '33333333-3333-4333-8333-333333333333',
      eventAt: '2026-10-06T13:00:00Z',
      repository: store.repo,
    });
    expect(store.tasks.size).toBe(1);
    expect([...store.records.values()][0]).toMatchObject({
      scheduledById: actor,
      dueAt: '2027-01-02T06:00:00.000Z',
    });
  });
  it('retains unlinked work and visibly rejects ambiguous identity', async () => {
    const store = createStore();
    store.source.companyId = null;
    await store.run();
    expect(store.assignments.size).toBe(0);
    expect(store.tasks.size).toBe(1);
    const ambiguous = createStore();
    ambiguous.repo.findActorWholesalers = async () => [];
    expect(await ambiguous.run()).toEqual({
      status: 'invalid',
      reason: 'scheduler_identity',
    });
    expect(ambiguous.tasks.size).toBe(0);
  });
  it('cancels existing work without deleting it or closing shared assignments', async () => {
    const store = createStore();
    await store.run();
    store.source.followUpDate = null;
    await store.run();
    expect([...store.tasks.values()][0]?.status).toBe('CANCELLED');
    expect(store.assignments.size).toBe(1);
  });
  it('ignores an obsolete event after another person changed the schedule request', async () => {
    const store = createStore();
    store.source.followUpRequestKey = 'new-request';
    expect(
      await reconcileFollowUp({
        activityId: 'a',
        actorWorkspaceMemberId: actor,
        eventAt: '2026-10-05T13:00:00Z',
        expectedRequestKey: 'old-request',
        repository: store.repo,
      }),
    ).toEqual({ status: 'stale' });
    expect(store.records.size).toBe(0);
  });
  it('does not create another occurrence from an unrelated source edit', async () => {
    const store = createStore();
    expect(
      await reconcileFollowUp({
        activityId: 'a',
        actorWorkspaceMemberId: actor,
        eventAt: '2026-10-05T13:00:00Z',
        allowCreate: false,
        repository: store.repo,
      }),
    ).toEqual({ status: 'unchanged' });
    expect(store.tasks.size).toBe(0);
  });
  it('creates a deliberate new occurrence after completion while preserving earlier history', async () => {
    const store = createStore();
    store.source.followUpRequestKey = 'first';
    await store.run();
    const first = [...store.records.values()][0]!;
    store.records.set(first.id, { ...first, status: 'COMPLETED' });
    store.source.followUpRequestKey = 'second';
    await store.run();
    expect(store.records.size).toBe(2);
    expect(store.tasks.size).toBe(2);
    expect(store.records.get(first.id)?.status).toBe('COMPLETED');
  });
  it('rejects nonexistent calendar dates before creating any work', async () => {
    const store = createStore();
    store.source.followUpDate = '2026-02-31';
    expect(await store.run()).toMatchObject({
      status: 'invalid',
      reason: 'invalid_date',
    });
    expect(store.tasks.size).toBe(0);
  });
  it('does not reopen a completed occurrence on replay', async () => {
    const store = createStore();
    await store.run();
    const row = [...store.records.values()][0]!;
    store.records.set(row.id, { ...row, status: 'COMPLETED' });
    expect(await store.run()).toMatchObject({ status: 'unchanged' });
  });
});
