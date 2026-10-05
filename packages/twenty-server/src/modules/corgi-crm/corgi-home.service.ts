import { Injectable, Logger } from '@nestjs/common';

import { Temporal } from 'temporal-polyfill';
import {
  type CorgiAvailability,
  type CorgiAllocationAttribution,
  type CorgiBusinessRecord,
  type CorgiClientCompany,
  type CorgiFollowUp,
  type CorgiFollowUpCompany,
  type CorgiHomeQuery,
  type CorgiHomeSummary,
  type CorgiMeeting,
  type CorgiMetric,
  type CorgiMetricKey,
  type CorgiMoney,
  type CorgiPage,
  type CorgiRecordLink,
  type CorgiTeamMember,
  type CorgiTrendDay,
  type CorgiWin,
} from 'twenty-shared/types';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  CorgiHomeQueryService,
  CorgiHomeUnavailable,
  corgiErrorAvailability,
} from 'src/modules/corgi-crm/corgi-home-query.service';
import {
  CORGI_PAGE_SIZE,
  CORGI_TIME_ZONE,
  corgiDayRange,
  corgiPageCursor,
  parseCorgiHomeQuery,
  readCorgiOffset,
} from 'src/modules/corgi-crm/corgi-home.utils';

type Row = Record<string, unknown>;
const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value instanceof Date
      ? value.toISOString()
      : '';
const nullableText = (value: unknown): string | null => text(value) || null;
const count = (value: unknown) => Number(value ?? 0);
const plural: Record<string, string> = {
  company: 'companies',
  person: 'people',
  outreachActivity: 'outreachActivities',
  meetingBooking: 'meetingBookings',
  companyAllocation: 'companyAllocations',
  wholesaler: 'wholesalers',
  workspaceMember: 'workspaceMembers',
  outreachFollowUp: 'outreachFollowUps',
  leadAssignment: 'leadAssignments',
  task: 'tasks',
};
const labelColumn = (object: string) =>
  object === 'companyAllocation'
    ? 'ticker'
    : object === 'task'
      ? 'title'
      : 'name';
const labelColumns = (object: string) =>
  ['person', 'workspaceMember'].includes(object)
    ? ['nameFirstName', 'nameLastName']
    : [labelColumn(object)];
const label = (object: string, row: Row) =>
  ['person', 'workspaceMember'].includes(object)
    ? [text(row.nameFirstName), text(row.nameLastName)]
        .filter(Boolean)
        .join(' ')
    : text(row[labelColumn(object)]);
const link = (object: string, row: Row): CorgiRecordLink => ({
  id: text(row.id),
  objectNameSingular: object,
  objectNamePlural: plural[object],
  label: label(object, row) || 'Unnamed record',
});
const money = (row: Row): CorgiMoney[] =>
  row.currencyCode
    ? [
        {
          currencyCode: text(row.currencyCode),
          amountMicros: String(row.amountMicros ?? '0'),
        },
      ]
    : [];
const page = <T>(
  records: T[],
  totalCount: number,
  query: CorgiHomeQuery,
  size = CORGI_PAGE_SIZE,
): CorgiPage<T> => ({
  status: 'available',
  records,
  totalCount,
  nextCursor:
    readCorgiOffset(query) + records.length < totalCount
      ? corgiPageCursor(readCorgiOffset(query) + size, query)
      : null,
});
const unavailablePage = <T>(status: CorgiAvailability): CorgiPage<T> => ({
  status,
  records: [],
  totalCount: null,
  nextCursor: null,
});

@Injectable()
export class CorgiHomeService {
  private readonly logger = new Logger(CorgiHomeService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly queries: CorgiHomeQueryService,
  ) {}

  async get(input: Record<string, unknown>) {
    const query = parseCorgiHomeQuery(input);

    readCorgiOffset(query);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      if (!this.queries.isInstalled())
        return query.section
          ? unavailablePage('unavailable')
          : this.emptySummary();
      if (query.section) return this.section(query);

      return this.summary();
    });
  }

  private actorId(): string | undefined {
    const auth = getWorkspaceAuthContext();

    return auth.type === 'user' ? auth.workspaceMemberId : undefined;
  }

  private async safePage<T>(
    work: () => Promise<CorgiPage<T>>,
  ): Promise<CorgiPage<T>> {
    try {
      return await work();
    } catch (error) {
      this.report(error);

      return unavailablePage(corgiErrorAvailability(error));
    }
  }

  private report(error: unknown) {
    if (
      error instanceof CorgiHomeUnavailable ||
      corgiErrorAvailability(error) === 'denied'
    )
      return;
    this.logger.error(
      'CRM dashboard projection failed',
      error instanceof Error ? error.stack : undefined,
    );
  }

  private async metric(
    key: CorgiMetricKey,
    query: CorgiHomeQuery = {},
  ): Promise<CorgiMetric> {
    try {
      if (key === 'currentClients') {
        const row = await this.clientBase(query)
          .select('COUNT(DISTINCT company.id)', 'count')
          .getRawOne<Row>();

        return { status: 'available', count: count(row?.count) };
      }
      const base = this.metricBase(key, query);
      const total = await base.clone().getCount();
      const amounts =
        key === 'allocations' ? await this.amounts(base) : undefined;

      return {
        status: 'available',
        count: total,
        ...(amounts ? { amounts } : {}),
      };
    } catch (error) {
      this.report(error);

      return { status: corgiErrorAvailability(error), count: null };
    }
  }

  private range(query: CorgiHomeQuery) {
    const from = corgiDayRange(query.from);
    const to = corgiDayRange(query.to ?? query.from);

    return { start: from.start, end: to.end };
  }

  private dateFilter(
    base: WorkspaceSelectQueryBuilder,
    field: string,
    query: CorgiHomeQuery,
  ) {
    const expression =
      field === 'occurredAt'
        ? 'COALESCE(r.occurredAt, r.createdAt)'
        : `r.${field}`;

    return base.andWhere(
      `${expression} >= :dateStart AND ${expression} < :dateEnd`,
      {
        dateStart: this.range(query).start,
        dateEnd: this.range(query).end,
      },
    );
  }

  private metricBase(
    key: Exclude<CorgiMetricKey, 'currentClients'>,
    query: CorgiHomeQuery,
  ) {
    const object =
      key === 'activities'
        ? 'outreachActivity'
        : key === 'allocations'
          ? 'companyAllocation'
          : 'meetingBooking';
    const timestamp =
      key === 'activities'
        ? 'occurredAt'
        : key === 'allocations'
          ? 'loggedAt'
          : key === 'meetingsSet'
            ? 'bookedAt'
            : 'heldAt';
    const columns = ['id', ...labelColumns(object), 'createdAt', timestamp];

    if (key === 'allocations')
      columns.push(
        'amountAmountMicros',
        'amountCurrencyCode',
        'allocationValidationMessage',
      );
    if (key === 'meetingsTaken' || key === 'meetingsSet')
      columns.push('status');
    const base = this.queries.query(object, columns);

    if (key === 'allocations')
      base.andWhere("COALESCE(r.allocationValidationMessage, '') = ''");

    if (query.allTime === 'true') base.andWhere(`r.${timestamp} IS NOT NULL`);
    else this.dateFilter(base, timestamp, query);
    if (key === 'meetingsTaken')
      base.andWhere('r.status = :completed', { completed: 'COMPLETED' });
    if (key === 'meetingsSet')
      base.andWhere('r.status <> :draft', { draft: 'DRAFT' });
    if (query.companyId) {
      this.queries.query(object, ['companyId']);
      if (query.companyId === 'unlinked') base.andWhere('r.companyId IS NULL');
      else
        base.andWhere('r.companyId = :companyId', {
          companyId: query.companyId,
        });
    }
    if (key === 'allocations') {
      for (const [field, value] of [
        ['externalWholesalerId', query.creditedWholesalerId],
        ['contactId', query.contactId],
      ] as const) {
        if (!value) continue;
        this.queries.query(object, [field]);
        base.andWhere(`r.${field} = :${field}`, { [field]: value });
      }
    }
    if (query.workspaceMemberId) {
      if (key === 'activities' || key === 'allocations') {
        const relation =
          key === 'activities' ? 'wholesaler' : 'externalWholesaler';

        this.queries.query(object, [`${relation}Id`]);
        this.queries.query('wholesaler', ['id', 'workspaceMemberId']);
        base
          .innerJoin(`r.${relation}`, 'credited')
          .andWhere('credited.workspaceMemberId = :memberId', {
            memberId: query.workspaceMemberId,
          });
      } else {
        const field = key === 'meetingsSet' ? 'bookedById' : 'takenById';

        this.queries.query(object, [field]);
        base.andWhere(`r.${field} = :memberId`, {
          memberId: query.workspaceMemberId,
        });
      }
    }

    return this.search(base, labelColumn(object), query);
  }

  private search(
    base: WorkspaceSelectQueryBuilder,
    field: string,
    query: CorgiHomeQuery,
    alias = 'r',
  ) {
    if (query.search)
      base.andWhere(`${alias}.${field} ILIKE :search`, {
        search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
      });

    return base;
  }

  private async amounts(
    base: WorkspaceSelectQueryBuilder,
  ): Promise<CorgiMoney[]> {
    return (
      await base
        .clone()
        .select('r.amountCurrencyCode', 'currencyCode')
        .addSelect('SUM(r.amountAmountMicros)::text', 'amountMicros')
        .groupBy('r.amountCurrencyCode')
        .getRawMany<Row>()
    ).flatMap(money);
  }

  private businessRecord(object: string, row: Row): CorgiBusinessRecord {
    return {
      ...link(object, row),
      createdAt: text(row.createdAt),
      createdBy: nullableText(row.createdByWorkspaceMemberId),
      ...(row.status ? { status: text(row.status) } : {}),
      ...(row.amountCurrencyCode
        ? {
            amounts: [
              {
                currencyCode: text(row.amountCurrencyCode),
                amountMicros: String(row.amountAmountMicros ?? 0),
              },
            ],
          }
        : {}),
    };
  }

  private async metricRecords(
    key: Exclude<CorgiMetricKey, 'currentClients'>,
    query: CorgiHomeQuery,
  ) {
    return this.safePage(async () => {
      const base = this.metricBase(key, query);
      const total = await base.clone().getCount();
      const rows = await base
        .orderBy('r.createdAt', 'DESC')
        .addOrderBy('r.id', 'DESC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const object =
        key === 'activities'
          ? 'outreachActivity'
          : key === 'allocations'
            ? 'companyAllocation'
            : 'meetingBooking';

      return page(
        rows.map((row) => this.businessRecord(object, row)),
        total,
        query,
      );
    });
  }

  private clientBase(query: CorgiHomeQuery) {
    const base = this.queries.query('companyAllocation', [
      'id',
      'companyId',
      'loggedAt',
      'allocationDate',
      'amountAmountMicros',
      'amountCurrencyCode',
      'allocationValidationMessage',
    ]);

    this.queries.query('company', ['id', 'name']);
    base.innerJoin('r.company', 'company').andWhere('r.loggedAt IS NOT NULL');
    base.andWhere("COALESCE(r.allocationValidationMessage, '') = ''");
    if (query.companyId)
      base.andWhere('company.id = :companyId', { companyId: query.companyId });

    return this.search(base, 'name', query, 'company');
  }

  private async clients(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiClientCompany>> {
    return this.safePage(async () => {
      const base = this.clientBase(query);
      const total = await base
        .clone()
        .select('COUNT(DISTINCT company.id)', 'count')
        .getRawOne<Row>();
      const rows = await base
        .clone()
        .select('company.id', 'id')
        .addSelect('company.name', 'name')
        .addSelect('COUNT(r.id)', 'count')
        .addSelect('MAX(r.loggedAt)', 'lastAt')
        .groupBy('company.id')
        .addGroupBy('company.name')
        .orderBy('MAX(r.loggedAt)', 'DESC')
        .addOrderBy('company.id', 'DESC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      if (!rows.length) return page([], count(total?.count), query);
      const companyBase = base
        .clone()
        .andWhere('company.id IN (:...companyIds)', {
          companyIds: rows.map((row) => row.id),
        });
      const [amountRows, creditedWholesalers, contacts] = await Promise.all([
        companyBase
          .clone()
          .select('r.companyId', 'companyId')
          .addSelect('r.amountCurrencyCode', 'currencyCode')
          .addSelect('SUM(r.amountAmountMicros)::text', 'amountMicros')
          .groupBy('r.companyId')
          .addGroupBy('r.amountCurrencyCode')
          .getRawMany<Row>(),
        this.attributions(companyBase, 'externalWholesaler', 'wholesaler'),
        this.attributions(companyBase, 'contact', 'person'),
      ]);
      const records: CorgiClientCompany[] = rows.map((row) => ({
        company: link('company', row),
        allocationCount: count(row.count),
        amounts: amountRows
          .filter((amount) => amount.companyId === row.id)
          .flatMap(money),
        lastAllocationAt: text(row.lastAt),
        creditedWholesalers: creditedWholesalers.get(text(row.id)) ?? [],
        contacts: contacts.get(text(row.id)) ?? [],
      }));

      return page(records, count(total?.count), query);
    });
  }

  private async attributions(
    base: WorkspaceSelectQueryBuilder,
    relation: string,
    object: string,
  ) {
    this.queries.query('companyAllocation', [`${relation}Id`]);
    this.queries.query(object, ['id', ...labelColumns(object)]);
    const unassigned = `r.${relation}Id IS NULL`;
    const grouped = base
      .clone()
      .leftJoin(`r.${relation}`, 'person')
      .select('person.id', 'id')
      .addSelect('r.companyId', 'companyId')
      .addSelect('r.amountCurrencyCode', 'currencyCode')
      .addSelect(unassigned, 'unassigned')
      .addSelect('SUM(r.amountAmountMicros)::text', 'amountMicros')
      .addSelect('COUNT(r.id)', 'count')
      .groupBy('person.id')
      .addGroupBy('r.companyId')
      .addGroupBy('r.amountCurrencyCode')
      .addGroupBy(unassigned);

    for (const column of labelColumns(object))
      grouped
        .addSelect(`person.${column}`, column)
        .addGroupBy(`person.${column}`);
    const result = new Map<string, Map<string, CorgiAllocationAttribution>>();

    for (const row of await grouped.getRawMany<Row>()) {
      const id = text(row.id);
      const groupKey = id || (row.unassigned ? 'unassigned' : 'restricted');
      const companyId = text(row.companyId);
      const company =
        result.get(companyId) ?? new Map<string, CorgiAllocationAttribution>();
      const existing = company.get(groupKey) ?? {
        person: id ? link(object, row) : null,
        ...(id
          ? {}
          : {
              attributionStatus: row.unassigned
                ? ('unassigned' as const)
                : ('restricted' as const),
            }),
        allocationCount: 0,
        amounts: [],
      };

      existing.allocationCount += count(row.count);
      existing.amounts.push(...money(row));
      company.set(groupKey, existing);
      result.set(companyId, company);
    }

    return new Map(
      [...result].map(([companyId, attributions]) => [
        companyId,
        [...attributions.values()],
      ]),
    );
  }

  private async related(
    object: string,
    id: unknown,
  ): Promise<CorgiRecordLink | null> {
    if (!id) return null;
    try {
      const row = await this.queries
        .query(object, ['id', ...labelColumns(object)])
        .where('r.id = :id', { id })
        .getRawOne<Row>();

      return row ? link(object, row) : null;
    } catch (error) {
      this.report(error);

      return null;
    }
  }

  private followUpBase(query: CorgiHomeQuery) {
    const memberId = query.workspaceMemberId ?? this.actorId();

    if (!memberId)
      throw new CorgiHomeUnavailable(
        'Choose a workspace member to see personal follow-ups',
      );
    const owner = query.scope === 'assigned' ? 'assigneeId' : 'scheduledById';
    const base = this.queries.query('outreachFollowUp', [
      'id',
      'name',
      'createdAt',
      'dueAt',
      'status',
      'companyId',
      'contactId',
      'activityId',
      owner,
    ]);

    base.andWhere(`r.${owner} = :memberId`, { memberId });
    if (query.status !== 'all')
      base.andWhere('r.status = :status', {
        status: query.status === 'completed' ? 'COMPLETED' : 'OPEN',
      });
    if (query.companyId === 'unlinked') base.andWhere('r.companyId IS NULL');
    else if (query.companyId)
      base.andWhere('r.companyId = :companyId', { companyId: query.companyId });

    return this.search(base, 'name', query);
  }

  private async followUpRecord(row: Row): Promise<CorgiFollowUp> {
    const [company, contact, activity] = await Promise.all([
      this.related('company', row.companyId),
      this.related('person', row.contactId),
      this.related('outreachActivity', row.activityId),
    ]);

    return {
      ...this.businessRecord('outreachFollowUp', row),
      status:
        row.status === 'COMPLETED'
          ? 'COMPLETED'
          : row.status === 'CANCELLED'
            ? 'CANCELLED'
            : 'OPEN',
      dueAt: nullableText(row.dueAt),
      company,
      contact,
      activity,
      reason: nullableText(row.name),
      canComplete:
        this.queries.canUpdate('outreachFollowUp') && row.status === 'OPEN',
    };
  }

  private async followUps(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiFollowUp>> {
    return this.safePage(async () => {
      const base = this.followUpBase(query);
      const total = await base.clone().getCount();
      const rows = await base
        .orderBy('r.dueAt', 'ASC', 'NULLS LAST')
        .addOrderBy('r.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();

      return page(
        await Promise.all(rows.map((row) => this.followUpRecord(row))),
        total,
        query,
      );
    });
  }

  private async followUpCompanies(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiFollowUpCompany>> {
    return this.safePage(async () => {
      const base = this.followUpBase({ ...query, search: undefined });

      this.queries.query('company', ['id', 'name']);
      base.leftJoin('r.company', 'company');
      if (query.search) {
        // Search companies in this company-oriented view, independently of reminder names.
        base.andWhere('company.name ILIKE :companySearch', {
          companySearch: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        });
      }
      const total = await base
        .clone()
        .select(
          "COUNT(DISTINCT COALESCE(company.id::text, 'unlinked'))",
          'count',
        )
        .getRawOne<Row>();
      const rows = await base
        .clone()
        .select('company.id', 'id')
        .addSelect('company.name', 'name')
        .addSelect(
          "MIN(CASE WHEN r.status = 'OPEN' THEN r.dueAt END)",
          'nextDueAt',
        )
        .addSelect("COUNT(*) FILTER (WHERE r.status = 'OPEN')", 'openCount')
        .addSelect('COUNT(r.id)', 'totalCount')
        .groupBy('company.id')
        .addGroupBy('company.name')
        .orderBy(
          "MIN(CASE WHEN r.status = 'OPEN' THEN r.dueAt END)",
          'ASC',
          'NULLS LAST',
        )
        .addOrderBy('company.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const records: CorgiFollowUpCompany[] = [];

      for (const row of rows) {
        const companyId = text(row.id);
        const remindersQuery = {
          ...query,
          section: 'followUps' as const,
          companyId: companyId || 'unlinked',
          cursor: undefined,
          search: undefined,
        };
        const remindersBase = this.followUpBase(remindersQuery);

        if (!companyId) remindersBase.andWhere('r.companyId IS NULL');
        const reminderRows = await remindersBase
          .orderBy('r.dueAt', 'ASC', 'NULLS LAST')
          .addOrderBy('r.id', 'ASC')
          .limit(5)
          .getRawMany<Row>();
        let lastActivityAt: string | null = null;

        if (companyId) {
          try {
            const last = await this.queries
              .query('outreachActivity', ['id', 'companyId', 'occurredAt'])
              .where('r.companyId = :companyId', { companyId })
              .select('MAX(r.occurredAt)', 'lastAt')
              .getRawOne<Row>();

            lastActivityAt = nullableText(last?.lastAt);
          } catch (error) {
            this.report(error);
          }
        }
        records.push({
          company: companyId ? link('company', row) : null,
          nextDueAt: nullableText(row.nextDueAt),
          lastActivityAt,
          openCount: count(row.openCount),
          totalCount: count(row.totalCount),
          reminders: await Promise.all(
            reminderRows.map((reminder) => this.followUpRecord(reminder)),
          ),
          nextReminderCursor:
            count(row.totalCount) > 5
              ? corgiPageCursor(5, remindersQuery)
              : null,
        });
      }

      return page(records, count(total?.count), query);
    });
  }

  private async agenda(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiMeeting>> {
    return this.safePage(async () => {
      const base = this.queries.query('meetingBooking', [
        'id',
        'name',
        'createdAt',
        'scheduledAt',
        'status',
        'companyId',
        'contactId',
        'wholesalerId',
      ]);

      this.dateFilter(base, 'scheduledAt', query).andWhere(
        'r.status = :status',
        { status: 'BOOKED' },
      );
      if (query.workspaceMemberId) {
        this.queries.query('wholesaler', ['id', 'workspaceMemberId']);
        base
          .innerJoin('r.wholesaler', 'owner')
          .andWhere('owner.workspaceMemberId = :memberId', {
            memberId: query.workspaceMemberId,
          });
      }
      const total = await base.clone().getCount();
      const rows = await base
        .orderBy('r.scheduledAt', 'ASC')
        .addOrderBy('r.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const records: CorgiMeeting[] = await Promise.all(
        rows.map(async (row) => ({
          ...this.businessRecord('meetingBooking', row),
          scheduledAt: text(row.scheduledAt),
          company: await this.related('company', row.companyId),
          contact: await this.related('person', row.contactId),
          owner: await this.related('wholesaler', row.wholesalerId),
          canMarkTaken: this.queries.canUpdate('meetingBooking'),
        })),
      );

      return page(records, total, query);
    });
  }

  private async activeClients(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiBusinessRecord>> {
    return this.safePage(async () => {
      const base = this.queries
        .query('company', ['id', 'name', 'createdAt', 'activeClient'])
        .where('r.activeClient = :active', { active: true });

      this.search(base, 'name', query);
      if (query.workspaceMemberId) {
        this.queries.query('company', ['accountOwnerId']);
        this.queries.query('companyOwnership', ['companyId', 'wholesalerId']);
        this.queries.query('wholesaler', ['workspaceMemberId']);
        base.andWhere({
          whereFactory: (where) =>
            where
              .where({ accountOwnerId: query.workspaceMemberId })
              .orWhere({
                companyOwnerships: {
                  wholesaler: { workspaceMemberId: query.workspaceMemberId },
                },
              }),
        });
      }
      const total = await base.clone().getCount();
      const rows = await base
        .orderBy('r.name', 'ASC')
        .addOrderBy('r.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();

      return page(
        rows.map((row) => this.businessRecord('company', row)),
        total,
        query,
      );
    });
  }

  private async team(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiTeamMember>> {
    return this.safePage(async () => {
      const base = this.queries.query('workspaceMember', [
        'id',
        'nameFirstName',
        'nameLastName',
      ]);

      if (query.workspaceMemberId)
        base.where('r.id = :memberId', { memberId: query.workspaceMemberId });
      const total = await base.clone().getCount();
      const members = await base
        .orderBy('r.nameFirstName', 'ASC')
        .addOrderBy('r.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const ids = members.map((member) => text(member.id));
      const keys = [
        'activities',
        'meetingsSet',
        'meetingsTaken',
        'allocations',
        'openFollowUps',
      ] as const;
      const grouped = await Promise.all(
        keys.map(async (key) => {
          try {
            const stats =
              key === 'openFollowUps'
                ? this.queries
                    .query('outreachFollowUp', ['id', 'assigneeId', 'status'])
                    .where('r.status = :status', { status: 'OPEN' })
                : this.metricBase(key, { from: query.from, to: query.to });
            let owner: string;

            if (key === 'activities' || key === 'allocations') {
              const relation =
                key === 'activities' ? 'wholesaler' : 'externalWholesaler';

              this.queries.query(
                key === 'activities' ? 'outreachActivity' : 'companyAllocation',
                [`${relation}Id`],
              );
              this.queries.query('wholesaler', ['id', 'workspaceMemberId']);
              stats.innerJoin(`r.${relation}`, 'owner');
              owner = 'owner.workspaceMemberId';
            } else
              owner = `r.${key === 'openFollowUps' ? 'assigneeId' : key === 'meetingsSet' ? 'bookedById' : 'takenById'}`;
            if (key === 'meetingsSet' || key === 'meetingsTaken')
              this.queries.query('meetingBooking', [
                key === 'meetingsSet' ? 'bookedById' : 'takenById',
              ]);
            if (!ids.length)
              return {
                status: 'available' as const,
                values: new Map<string, CorgiMetric>(),
              };
            stats
              .andWhere(`${owner} IN (:...memberIds)`, { memberIds: ids })
              .select(owner, 'memberId')
              .addSelect('COUNT(r.id)', 'count')
              .groupBy(owner);
            if (key === 'allocations')
              stats
                .addSelect('r.amountCurrencyCode', 'currencyCode')
                .addSelect('SUM(r.amountAmountMicros)::text', 'amountMicros')
                .addGroupBy('r.amountCurrencyCode');
            const values = new Map<string, CorgiMetric>();

            for (const row of await stats.getRawMany<Row>()) {
              const previous = values.get(text(row.memberId)) ?? {
                status: 'available',
                count: 0,
                ...(key === 'allocations' ? { amounts: [] } : {}),
              };

              previous.count = (previous.count ?? 0) + count(row.count);
              if (key === 'allocations')
                previous.amounts = [...(previous.amounts ?? []), ...money(row)];
              values.set(text(row.memberId), previous);
            }

            return { status: 'available' as const, values };
          } catch (error) {
            this.report(error);

            return {
              status: corgiErrorAvailability(error),
              values: new Map<string, CorgiMetric>(),
            };
          }
        }),
      );
      const records = await Promise.all(
        members.map(async (member) => {
          let person: CorgiRecordLink | null = null;

          try {
            const wholesaler = await this.queries
              .query('wholesaler', ['id', 'name', 'workspaceMemberId'])
              .where('r.workspaceMemberId = :memberId', { memberId: member.id })
              .getRawOne<Row>();

            person = wholesaler ? link('wholesaler', wholesaler) : null;
          } catch (error) {
            this.report(error);
          }
          const metrics = Object.fromEntries(
            keys.map((key, index) => [
              key,
              grouped[index].values.get(text(member.id)) ?? {
                status: grouped[index].status,
                count: grouped[index].status === 'available' ? 0 : null,
                ...(key === 'allocations' ? { amounts: [] } : {}),
              },
            ]),
          ) as Pick<CorgiTeamMember, (typeof keys)[number]>;

          return {
            workspaceMemberId: text(member.id),
            person,
            name: label('workspaceMember', member),
            ...metrics,
          };
        }),
      );

      return page(records, total, query);
    });
  }

  private async trends(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiTrendDay>> {
    return this.safePage(async () => {
      const today = Temporal.PlainDate.from(corgiDayRange().date);
      const from = query.from ?? today.subtract({ days: 13 }).toString();
      const to = query.to ?? today.toString();
      if (
        Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days >
          365 ||
        from > to
      )
        throw new CorgiHomeUnavailable(
          'Choose a date range of at most one year',
        );
      const base = this.metricBase('activities', { ...query, from, to });

      this.queries.query('outreachActivity', ['activityType']);
      const day =
        "to_char(COALESCE(r.occurredAt, r.createdAt) AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD')";
      const rows = await base
        .select(day, 'date')
        .addSelect('r.activityType', 'activityType')
        .addSelect('COUNT(r.id)', 'count')
        .groupBy(day)
        .addGroupBy('r.activityType')
        .getRawMany<Row>();
      const days: CorgiTrendDay[] = [];

      for (
        let date = Temporal.PlainDate.from(from);
        date.toString() <= to;
        date = date.add({ days: 1 })
      ) {
        const dayRows = rows.filter((row) => row.date === date.toString());

        days.push({
          date: date.toString(),
          activities: dayRows.reduce(
            (total, row) => total + count(row.count),
            0,
          ),
          byType: Object.fromEntries(
            dayRows.map((row) => [
              text(row.activityType) || 'OTHER',
              count(row.count),
            ]),
          ),
        });
      }
      const offset = readCorgiOffset(query);

      return page(days.slice(offset, offset + 366), days.length, query, 366);
    });
  }

  private async latest(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiBusinessRecord>> {
    const objects = [
      'outreachActivity',
      'meetingBooking',
      'companyAllocation',
      'company',
      'person',
      'leadAssignment',
      'wholesaler',
      'outreachFollowUp',
    ];
    const offset = readCorgiOffset(query);
    const size = query.section ? CORGI_PAGE_SIZE : 5;
    const sources = await Promise.all(
      objects.map((object) =>
        this.safePage(async () => {
          const base = this.queries.query(object, [
            'id',
            ...labelColumns(object),
            'createdAt',
          ]);

          if (query.search) this.search(base, labelColumns(object)[0], query);
          const total = await base.clone().getCount();
          const rows = await base
            .orderBy('r.createdAt', 'DESC')
            .addOrderBy('r.id', 'DESC')
            .limit(offset + size)
            .getRawMany<Row>();

          return page(
            rows.map((row) => this.businessRecord(object, row)),
            total,
            {},
            size,
          );
        }),
      ),
    );
    const available = sources.filter((source) => source.status === 'available');

    if (!available.length)
      return unavailablePage(
        sources.some((source) => source.status === 'denied')
          ? 'denied'
          : 'unavailable',
      );
    const records = available
      .flatMap((source) => source.records)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
      .slice(offset, offset + size);

    return page(
      records,
      available.reduce((total, source) => total + (source.totalCount ?? 0), 0),
      query,
      size,
    );
  }

  private async wins(query: CorgiHomeQuery): Promise<CorgiPage<CorgiWin>> {
    const definitions = [
      {
        object: 'meetingBooking',
        kind: 'meeting-booked' as const,
        recorded: 'bookedAt',
        effective: 'bookedAt',
        actor: 'bookedById',
      },
      {
        object: 'meetingBooking',
        kind: 'meeting-taken' as const,
        recorded: 'heldRecordedAt',
        effective: 'heldAt',
        actor: 'takenById',
      },
      {
        object: 'companyAllocation',
        kind: 'allocation-logged' as const,
        recorded: 'loggedAt',
        effective: 'loggedAt',
        actor: 'loggedById',
      },
    ];
    const offset = readCorgiOffset(query);
    const sources = await Promise.all(
      definitions.map((definition) =>
        this.safePage(async () => {
          const columns = [
            ...new Set([
              'id',
              ...labelColumns(definition.object),
              'createdAt',
              definition.recorded,
              definition.effective,
              definition.actor,
            ]),
          ];
          const base = this.queries
            .query(definition.object, columns)
            .where(`r.${definition.recorded} IS NOT NULL`);

          if (query.from || query.to)
            this.dateFilter(base, definition.recorded, query);
          const total = await base.clone().getCount();
          const rows = await base
            .orderBy(`r.${definition.recorded}`, 'DESC')
            .addOrderBy('r.id', 'DESC')
            .limit(offset + CORGI_PAGE_SIZE)
            .getRawMany<Row>();
          const records = await Promise.all(
            rows.map(async (row) => ({
              id: `${definition.kind}:${text(row.id)}`,
              kind: definition.kind,
              record: link(definition.object, row),
              actorName:
                (await this.related('workspaceMember', row[definition.actor]))
                  ?.label ?? null,
              actorWorkspaceMemberId: nullableText(row[definition.actor]),
              recordedAt: text(row[definition.recorded]),
              effectiveAt: text(row[definition.effective]),
              isCreation: definition.kind !== 'meeting-taken',
            })),
          );

          return page(records, total, {});
        }),
      ),
    );
    const available = sources.filter((source) => source.status === 'available');

    if (!available.length)
      return unavailablePage(
        sources.some((source) => source.status === 'denied')
          ? 'denied'
          : 'unavailable',
      );
    const records = available
      .flatMap((source) => source.records)
      .sort(
        (a, b) =>
          b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id),
      )
      .slice(offset, offset + CORGI_PAGE_SIZE);

    return page(
      records,
      available.reduce((total, source) => total + (source.totalCount ?? 0), 0),
      query,
    );
  }

  private async summary(): Promise<CorgiHomeSummary> {
    const keys: CorgiMetricKey[] = [
      'activities',
      'meetingsSet',
      'meetingsTaken',
      'allocations',
      'currentClients',
    ];
    const metricValues = await Promise.all(keys.map((key) => this.metric(key)));
    const [
      latestRecords,
      followUps,
      agenda,
      team,
      recentAllocations,
      activeClients,
      liveWins,
    ] = await Promise.all([
      this.latest({}),
      this.followUps({ scope: 'assigned', status: 'open' }),
      this.agenda({}),
      this.team({}),
      this.metricRecords('allocations', {}),
      this.activeClients({}),
      this.wins({}),
    ]);

    return {
      enabled: true,
      timeZone: CORGI_TIME_ZONE,
      generatedAt: new Date().toISOString(),
      today: {
        date: corgiDayRange().date,
        metrics: Object.fromEntries(
          keys.map((key, index) => [key, metricValues[index]]),
        ) as Record<CorgiMetricKey, CorgiMetric>,
      },
      latestRecords,
      followUps,
      agenda,
      team,
      recentAllocations,
      activeClients,
      liveWins,
    };
  }

  private emptySummary(): CorgiHomeSummary {
    const unavailable = { status: 'unavailable' as const, count: null };

    return {
      enabled: false,
      timeZone: CORGI_TIME_ZONE,
      generatedAt: new Date().toISOString(),
      today: {
        date: corgiDayRange().date,
        metrics: {
          activities: unavailable,
          meetingsSet: unavailable,
          meetingsTaken: unavailable,
          allocations: unavailable,
          currentClients: unavailable,
        },
      },
      latestRecords: unavailablePage('unavailable'),
      followUps: unavailablePage('unavailable'),
      agenda: unavailablePage('unavailable'),
      team: unavailablePage('unavailable'),
      recentAllocations: unavailablePage('unavailable'),
      activeClients: unavailablePage('unavailable'),
      liveWins: unavailablePage('unavailable'),
    };
  }

  private section(query: CorgiHomeQuery) {
    switch (query.section) {
      case 'currentClients':
        return this.clients(query);
      case 'followUps':
        return this.followUps(query);
      case 'followUpCompanies':
        return this.followUpCompanies(query);
      case 'agenda':
        return this.agenda(query);
      case 'team':
        return this.team(query);
      case 'trends':
        return this.trends(query);
      case 'activeClients':
        return this.activeClients(query);
      case 'liveWins':
        return this.wins(query);
      case 'latestRecords':
        return this.latest(query);
      default:
        return this.metricRecords(query.section ?? 'activities', query);
    }
  }
}
