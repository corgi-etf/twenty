import { deterministicCorgiUuid } from 'src/modules/core/deterministic-uuid';
import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type FollowUpActivity,
  type FollowUpRecord,
  type FollowUpRepository,
} from 'src/modules/outreach/services/reconcile-follow-up.service';

const FOLLOW_UP_FIELDS =
  'id name occurrenceKey activityId companyId contactId scheduledById assigneeId wholesalerId scheduledAt dueAt status assignmentId taskId';
type Row = Record<string, unknown>;
const pluralFor = (object: string) =>
  object === 'person'
    ? 'people'
    : object.endsWith('y')
      ? `${object.slice(0, -1)}ies`
      : `${object}s`;
const typeFor = (object: string) => object[0]!.toUpperCase() + object.slice(1);

export class CoreFollowUpRepository implements FollowUpRepository {
  public constructor(
    private readonly transport: Pick<RawCoreGraphqlTransport, 'request'>,
  ) {}
  private async rows(
    object: string,
    filter: Row,
    fields: string,
    first = 2,
  ): Promise<Row[]> {
    const plural = pluralFor(object);
    const type = typeFor(object);
    const result = await this.transport.request<
      Record<string, { edges: { node: Row }[] }>,
      { filter: Row; first: number }
    >({
      operationName: 'CorgiFollowUpRead',
      document: `query CorgiFollowUpRead($filter:${type}FilterInput,$first:Int!) { ${plural}(filter:$filter,first:$first,orderBy:{createdAt:DescNullsLast}) {edges {node {${fields}}}} }`,
      variables: { filter, first },
    });
    if (!result[plural]?.edges)
      throw new Error(`Missing ${object} follow-up response`);
    return result[plural]!.edges.map((edge) => edge.node);
  }
  private async one(
    object: string,
    id: string,
    fields: string,
  ): Promise<Row | null> {
    return (await this.rows(object, { id: { eq: id } }, fields))[0] ?? null;
  }
  private async update(object: string, filter: Row, data: Row): Promise<Row[]> {
    const type = typeFor(object);
    const operation = `update${pluralFor(type)}`;
    const result = await this.transport.request<
      Record<string, Row[]>,
      { filter: Row; data: Row }
    >({
      operationName: 'CorgiFollowUpUpdate',
      document: `mutation CorgiFollowUpUpdate($filter:${type}FilterInput!,$data:${type}UpdateInput!) {${operation}(filter:$filter,data:$data) {id}}`,
      variables: { filter, data },
    });
    return result[operation] ?? [];
  }
  private async ensure(
    object: string,
    id: string,
    data: Row,
    identity: string[],
  ): Promise<Row> {
    const fields = [...new Set(['id', ...identity])].join(' ');
    const verify = (row: Row) => {
      if (row.id !== id || identity.some((key) => row[key] !== data[key]))
        throw new Error(`${object} deterministic identity collision`);
      return row;
    };
    const existing = await this.one(object, id, fields);
    if (existing) return verify(existing);
    const type = typeFor(object);
    try {
      const result = await this.transport.request<
        Record<string, Row>,
        { data: Row }
      >({
        operationName: 'CorgiFollowUpCreate',
        document: `mutation CorgiFollowUpCreate($data:${type}CreateInput!) {create${type}(data:$data) {${fields}}}`,
        variables: { data: { id, ...data } },
      });
      const created = result[`create${type}`];
      if (created) return verify(created);
    } catch (error) {
      const recovered = await this.one(object, id, fields);
      if (recovered) return verify(recovered);
      throw error;
    }
    throw new Error(`${object} creation was not confirmed`);
  }
  public async getActivity(id: string): Promise<FollowUpActivity | null> {
    const row = await this.one(
      'outreachActivity',
      id,
      'id followUpDate followUpRequestKey companyId contactId notes assignmentId company {name}',
    );
    return row
      ? ({
          ...row,
          companyName: (row.company as { name?: string } | null)?.name ?? null,
        } as FollowUpActivity)
      : null;
  }
  public async findOccurrence(key: string): Promise<FollowUpRecord | null> {
    return (
      ((
        await this.rows(
          'outreachFollowUp',
          { occurrenceKey: { eq: key } },
          FOLLOW_UP_FIELDS,
        )
      )[0] as FollowUpRecord) ?? null
    );
  }
  public async findOpen(activityId: string): Promise<FollowUpRecord | null> {
    const rows = await this.rows(
      'outreachFollowUp',
      { and: [{ activityId: { eq: activityId } }, { status: { eq: 'OPEN' } }] },
      FOLLOW_UP_FIELDS,
    );
    if (rows.length > 1)
      throw new Error(
        'More than one open follow-up exists; choose a reminder to reschedule.',
      );
    return (rows[0] as FollowUpRecord) ?? null;
  }
  public async findActorWholesalers(workspaceMemberId: string) {
    return (await this.rows(
      'wholesaler',
      { workspaceMemberId: { eq: workspaceMemberId } },
      'id workspaceMemberId',
    )) as { id: string; workspaceMemberId: string }[];
  }
  public async findOpenAssignment(input: {
    companyId: string;
    contactId: string | null;
    wholesalerId: string;
  }): Promise<string | null> {
    const rows = await this.rows(
      'leadAssignment',
      {
        and: [
          { companyId: { eq: input.companyId } },
          { wholesalerId: { eq: input.wholesalerId } },
          {
            contactId: input.contactId
              ? { eq: input.contactId }
              : { is: 'NULL' },
          },
          { completedAt: { is: 'NULL' } },
          { returnedAt: { is: 'NULL' } },
          {
            or: [
              { assignmentStatus: { eq: 'OPEN' } },
              { assignmentStatus: { eq: 'assigned' } },
              { assignmentStatus: { eq: 'pending' } },
            ],
          },
        ],
      },
      'id',
      1,
    );
    return typeof rows[0]?.id === 'string' ? rows[0].id : null;
  }
  public async ensureAssignment(
    input: Parameters<FollowUpRepository['ensureAssignment']>[0],
  ): Promise<void> {
    const { id, ...data } = input;
    await this.ensure(
      'leadAssignment',
      id,
      {
        ...data,
        assignmentDate: input.assignedAt.slice(0, 10),
        assignmentStatus: 'OPEN',
      },
      ['companyId', 'contactId', 'wholesalerId'],
    );
  }
  public async saveFollowUp(record: FollowUpRecord): Promise<void> {
    const { id, ...data } = record;
    await this.ensure('outreachFollowUp', id, data, [
      'occurrenceKey',
      'activityId',
      'scheduledById',
      'scheduledAt',
    ]);
    // Status is a concurrency fence: delayed scheduling must never reopen work
    // that its assignee has already completed in another session.
    const current = await this.one(
      'outreachFollowUp',
      id,
      'id status updatedAt',
    );
    if (current?.status !== 'OPEN' && record.status === 'OPEN')
      throw new Error(
        'Follow-up was completed while scheduling; retry without reopening.',
      );
    const mutable = Object.fromEntries(
      Object.entries(data).filter(
        ([key]) =>
          !['scheduledById', 'scheduledAt', 'occurrenceKey'].includes(key),
      ),
    );
    const rows = await this.update(
      'outreachFollowUp',
      { and: [{ id: { eq: id } }, { updatedAt: { eq: current?.updatedAt } }] },
      mutable,
    );
    if (!rows.length) throw new Error('Follow-up changed during save; retry.');
  }
  public async ensureTask(
    record: FollowUpRecord,
    allowReopen = false,
  ): Promise<void> {
    await this.ensure(
      'task',
      record.taskId,
      {
        title: record.name,
        dueAt: record.dueAt,
        assigneeId: record.assigneeId,
        wholesalerId: record.wholesalerId,
        status: record.status === 'OPEN' ? 'TODO' : 'DONE',
      },
      [],
    );
    const current = await this.one(
      'task',
      record.taskId,
      'id status updatedAt',
    );
    if (
      record.status === 'OPEN' &&
      current?.status === 'DONE' &&
      !allowReopen
    ) {
      await this.synchronizeTaskStatus(record.taskId);
      throw new Error('Follow-up task was completed while scheduling; retry.');
    }
    const rows = await this.update(
      'task',
      {
        and: [
          { id: { eq: record.taskId } },
          { updatedAt: { eq: current?.updatedAt } },
        ],
      },
      {
        title: record.name,
        dueAt: record.dueAt,
        assigneeId: record.assigneeId,
        wholesalerId: record.wholesalerId,
        status: record.status === 'OPEN' ? 'TODO' : 'DONE',
      },
    );
    if (!rows.length)
      throw new Error('Follow-up task update was not confirmed.');
  }
  public async ensureTarget(record: FollowUpRecord): Promise<void> {
    const id = deterministicCorgiUuid(
      'outreach-follow-up-target',
      record.taskId,
    );
    const current = await this.one(
      'taskTarget',
      id,
      'id taskId targetCompanyId',
    );
    if (!current && !record.companyId) return;
    await this.ensure(
      'taskTarget',
      id,
      { taskId: record.taskId, targetCompanyId: record.companyId },
      ['taskId'],
    );
    if (current && current.targetCompanyId !== record.companyId) {
      if (
        !(
          await this.update(
            'taskTarget',
            { and: [{ id: { eq: id } }, { taskId: { eq: record.taskId } }] },
            { targetCompanyId: record.companyId },
          )
        ).length
      )
        throw new Error('Task target relink was not confirmed');
    }
  }
  public async attachBacklinks(record: FollowUpRecord): Promise<void> {
    // Preserve an explicit pre-existing assignment/task even when it belongs
    // to another person; the follow-up junction retains this occurrence's links.
    for (const [field, value] of [
      ['followUpTaskId', record.taskId],
      ['assignmentId', record.assignmentId],
    ] as const) {
      if (!value) continue;
      await this.update(
        'outreachActivity',
        {
          and: [{ id: { eq: record.activityId } }, { [field]: { is: 'NULL' } }],
        },
        { [field]: value },
      );
      const row = await this.one(
        'outreachActivity',
        record.activityId,
        `id ${field}`,
      );
      if (!row?.[field])
        throw new Error('Follow-up backlink was not confirmed.');
    }
  }
  public async setValidation(
    activityId: string,
    message: string | null,
  ): Promise<void> {
    const current = await this.one(
      'outreachActivity',
      activityId,
      'id followUpValidationMessage',
    );
    if (current?.followUpValidationMessage !== message)
      await this.update(
        'outreachActivity',
        { id: { eq: activityId } },
        { followUpValidationMessage: message },
      );
  }
  public async synchronizeTaskStatus(taskId: string): Promise<void> {
    const task = await this.one('task', taskId, 'id status');
    if (!task) return;
    const status =
      task.status === 'DONE'
        ? 'COMPLETED'
        : task.status === 'TODO' || task.status === 'IN_PROGRESS'
          ? 'OPEN'
          : null;
    if (!status) return;
    const reminders = await this.rows(
      'outreachFollowUp',
      { taskId: { eq: taskId } },
      'id status',
      2,
    );
    for (const reminder of reminders) {
      if (reminder.status !== status && reminder.status !== 'CANCELLED')
        await this.update(
          'outreachFollowUp',
          {
            and: [
              { id: { eq: reminder.id } },
              { status: { eq: reminder.status } },
            ],
          },
          { status },
        );
    }
  }
  public async synchronizeReminder(id: string): Promise<void> {
    let record = (await this.one(
      'outreachFollowUp',
      id,
      FOLLOW_UP_FIELDS,
    )) as FollowUpRecord | null;
    if (!record?.taskId) return;
    const assignees = await this.findActorWholesalers(record.assigneeId);
    if (assignees.length !== 1) {
      await this.update(
        'outreachFollowUp',
        { id: { eq: id } },
        {
          validationMessage: 'The assignee must map to exactly one Wholesaler.',
        },
      );
      return;
    }
    if (assignees[0]!.id !== record.wholesalerId) {
      record = {
        ...record,
        wholesalerId: assignees[0]!.id,
        assignmentId: null,
      };
      if (record.companyId && record.status === 'OPEN') {
        const assignmentId =
          (await this.findOpenAssignment({
            companyId: record.companyId,
            contactId: record.contactId,
            wholesalerId: record.wholesalerId,
          })) ??
          deterministicCorgiUuid(
            'outreach-follow-up-assignment',
            `${record.id}:${record.companyId}:${record.contactId ?? ''}:${record.assigneeId}`,
          );
        await this.ensureAssignment({
          id: assignmentId,
          name: record.name,
          companyId: record.companyId,
          contactId: record.contactId,
          wholesalerId: record.wholesalerId,
          assignedAt: new Date().toISOString(),
        });
        record = { ...record, assignmentId };
      }
      await this.saveFollowUp(record);
    }
    await this.ensureTask(record, true);
    await this.ensureTarget(record);
    const current = await this.one(
      'outreachFollowUp',
      id,
      'id validationMessage',
    );
    if (current?.validationMessage)
      await this.update(
        'outreachFollowUp',
        { id: { eq: id } },
        { validationMessage: null },
      );
  }
}
