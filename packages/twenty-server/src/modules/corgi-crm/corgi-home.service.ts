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
  type CorgiLegacyFollowUp,
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
  applyCorgiFeedBoundary,
  corgiFeedPage,
  corgiFeedTimestamp,
} from 'src/modules/corgi-crm/corgi-home-feed.utils';
import {
  CORGI_PAGE_SIZE,
  CORGI_TIME_ZONE,
  corgiDayRange,
  corgiPageCursor,
  parseCorgiHomeQuery,
  readCorgiOffset,
  readCorgiFeedBoundary,
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
  note: 'notes',
};
const labelColumn = (object: string) =>
  object === 'companyAllocation'
    ? 'ticker'
    : object === 'task' || object === 'note'
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
    if (query.section === 'latestRecords' || query.section === 'liveWins')
      readCorgiFeedBoundary(query);

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
    if (key === 'meetingsTaken') columns.push('heldRecordedAt');
    const base = this.queries.query(object, columns);

    if (key === 'allocations') this.validAllocation(base);
    if (key === 'meetingsSet' || key === 'meetingsTaken')
      this.validMeeting(base);

    if (query.allTime === 'true') base.andWhere(`r.${timestamp} IS NOT NULL`);
    else this.dateFilter(base, timestamp, query);
    if (key === 'meetingsTaken')
      base.andWhere('r.status = :completed AND r.heldRecordedAt IS NOT NULL', {
        completed: 'COMPLETED',
      });
    if (key === 'meetingsSet')
      base.andWhere('r.status <> :draft', { draft: 'DRAFT' });
    this.filterCompany(base, object, query);
    if (key === 'allocations') {
      for (const [field, value] of [
        ['externalWholesalerId', query.creditedWholesalerId],
        ['contactId', query.contactId],
      ] as const) {
        if (!value) continue;
        this.queries.query(object, [field]);
        if (value === 'unassigned') base.andWhere(`r.${field} IS NULL`);
        else base.andWhere(`r.${field} = :${field}`, { [field]: value });
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

  private validAllocation(base: WorkspaceSelectQueryBuilder) {
    this.queries.query('companyAllocation', [
      'companyId',
      'ticker',
      'amountAmountMicros',
      'amountCurrencyCode',
      'loggedAt',
      'allocationValidationMessage',
    ]);

    // Reconciliation is asynchronous. Recheck scalar business validity so a
    // correction cannot briefly count or celebrate an invalid allocation.
    return base
      .andWhere('r.loggedAt IS NOT NULL')
      .andWhere('r.companyId IS NOT NULL')
      .andWhere("BTRIM(r.ticker) <> ''")
      .andWhere('r.amountAmountMicros > 0')
      .andWhere('r.amountAmountMicros = FLOOR(r.amountAmountMicros)')
      .andWhere("r.amountCurrencyCode ~ '^[A-Z]{3}$'")
      .andWhere("COALESCE(r.allocationValidationMessage, '') = ''");
  }

  private validMeeting(base: WorkspaceSelectQueryBuilder) {
    this.queries.query('meetingBooking', [
      'companyId',
      'wholesalerId',
      'scheduledAt',
      'bookingValidationMessage',
    ]);

    return base
      .andWhere('r.companyId IS NOT NULL')
      .andWhere('r.wholesalerId IS NOT NULL')
      .andWhere('r.scheduledAt IS NOT NULL')
      .andWhere("COALESCE(r.bookingValidationMessage, '') = ''");
  }

  private filterCompany(
    base: WorkspaceSelectQueryBuilder,
    object: string,
    query: CorgiHomeQuery,
  ) {
    if (!query.companyId) return base;
    this.queries.query(object, ['companyId']);
    if (query.companyId === 'unlinked')
      return base.andWhere('r.companyId IS NULL');
    if (query.companyId === 'restricted') {
      this.queries.query('company', ['id']);

      return base
        .leftJoin('r.company', 'visibleCompany')
        .andWhere('r.companyId IS NOT NULL AND visibleCompany.id IS NULL');
    }

    return base.andWhere('r.companyId = :companyId', {
      companyId: query.companyId,
    });
  }

  private search(
    base: WorkspaceSelectQueryBuilder,
    field: string | string[],
    query: CorgiHomeQuery,
    alias = 'r',
  ) {
    if (query.search)
      base.andWhere(
        `(${(Array.isArray(field) ? field : [field]).map((name) => `${alias}.${name} ILIKE :search`).join(' OR ')})`,
        {
          search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        },
      );

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
      createdBy: nullableText(row.createdByName),
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
    this.validAllocation(base);
    if (query.companyId === 'unlinked' || query.companyId === 'restricted')
      base.andWhere('1 = 0');
    else if (query.companyId)
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

  private async relatedBatch(object: string, values: unknown[]) {
    const ids = [...new Set(values.map(text).filter(Boolean))];

    if (!ids.length) return new Map<string, CorgiRecordLink>();
    try {
      const rows = await this.queries
        .query(object, ['id', ...labelColumns(object)])
        .where('r.id IN (:...ids)', { ids })
        .getRawMany<Row>();

      return new Map(rows.map((row) => [text(row.id), link(object, row)]));
    } catch (error) {
      this.report(error);

      return new Map<string, CorgiRecordLink>();
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
    this.filterCompany(base, 'outreachFollowUp', query);

    return this.search(base, 'name', query);
  }

  private async followUpRecords(rows: Row[]): Promise<CorgiFollowUp[]> {
    const [companies, contacts, activities] = await Promise.all([
      this.relatedBatch(
        'company',
        rows.map((row) => row.companyId),
      ),
      this.relatedBatch(
        'person',
        rows.map((row) => row.contactId),
      ),
      this.relatedBatch(
        'outreachActivity',
        rows.map((row) => row.activityId),
      ),
    ]);
    const canComplete = this.queries.canUpdate('outreachFollowUp', ['status']);

    return rows.map((row) => {
      const company = companies.get(text(row.companyId)) ?? null;

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
        ...(company
          ? {}
          : {
              companyStatus: row.companyId
                ? ('restricted' as const)
                : ('unlinked' as const),
            }),
        contact: contacts.get(text(row.contactId)) ?? null,
        activity: activities.get(text(row.activityId)) ?? null,
        reason: nullableText(row.name),
        canComplete: canComplete && row.status === 'OPEN',
      };
    });
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

      return page(await this.followUpRecords(rows), total, query);
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
      const companyKey =
        "COALESCE(company.id::text, CASE WHEN r.companyId IS NULL THEN 'unlinked' ELSE 'restricted' END)";
      const total = await base
        .clone()
        .select(`COUNT(DISTINCT ${companyKey})`, 'count')
        .getRawOne<Row>();
      const rows = await base
        .clone()
        .select('company.id', 'id')
        .addSelect('company.name', 'name')
        .addSelect('r.companyId IS NULL', 'unlinked')
        .addSelect(
          "MIN(CASE WHEN r.status = 'OPEN' THEN r.dueAt END)",
          'nextDueAt',
        )
        .addSelect("COUNT(*) FILTER (WHERE r.status = 'OPEN')", 'openCount')
        .addSelect('COUNT(r.id)', 'totalCount')
        // Only the first five IDs per visible group leave the database. Fetch
        // those records in one further scoped query instead of one per group.
        .addSelect(
          '(ARRAY_AGG(r.id ORDER BY r.dueAt ASC NULLS LAST, r.id ASC))[1 : 5]',
          'reminderIds',
        )
        .groupBy('company.id')
        .addGroupBy('company.name')
        .addGroupBy('r.companyId IS NULL')
        .orderBy(
          "MIN(CASE WHEN r.status = 'OPEN' THEN r.dueAt END)",
          'ASC',
          'NULLS LAST',
        )
        .addOrderBy(companyKey, 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const reminderIds = rows.flatMap((row) =>
        Array.isArray(row.reminderIds) ? row.reminderIds.map(text) : [],
      );
      const reminderRows = reminderIds.length
        ? await this.followUpBase({ ...query, search: undefined })
            .andWhere('r.id IN (:...reminderIds)', { reminderIds })
            .getRawMany<Row>()
        : [];
      const reminders = new Map(
        (await this.followUpRecords(reminderRows)).map((reminder) => [
          reminder.id,
          reminder,
        ]),
      );
      const companyIds = rows.map((row) => text(row.id)).filter(Boolean);
      const lastActivities = new Map<string, string | null>();

      if (companyIds.length) {
        try {
          const lastRows = await this.queries
            .query('outreachActivity', [
              'id',
              'companyId',
              'occurredAt',
              'createdAt',
            ])
            .where('r.companyId IN (:...companyIds)', { companyIds })
            .select('r.companyId', 'companyId')
            .addSelect('MAX(COALESCE(r.occurredAt, r.createdAt))', 'lastAt')
            .groupBy('r.companyId')
            .getRawMany<Row>();

          for (const row of lastRows)
            lastActivities.set(text(row.companyId), nullableText(row.lastAt));
        } catch (error) {
          this.report(error);
        }
      }
      const records: CorgiFollowUpCompany[] = rows.map((row) => {
        const companyId = text(row.id);
        const companyStatus = row.unlinked
          ? ('unlinked' as const)
          : ('restricted' as const);
        const remindersQuery = {
          ...query,
          section: 'followUps' as const,
          companyId: companyId || companyStatus,
          cursor: undefined,
          search: undefined,
        };

        return {
          company: companyId ? link('company', row) : null,
          ...(companyId ? {} : { companyStatus }),
          nextDueAt: nullableText(row.nextDueAt),
          lastActivityAt: lastActivities.get(companyId) ?? null,
          openCount: count(row.openCount),
          totalCount: count(row.totalCount),
          reminders: (Array.isArray(row.reminderIds)
            ? row.reminderIds.map(text)
            : []
          ).flatMap((id) => {
            const reminder = reminders.get(id);

            return reminder ? [reminder] : [];
          }),
          nextReminderCursor:
            count(row.totalCount) > 5
              ? corgiPageCursor(5, remindersQuery)
              : null,
        };
      });

      return page(records, count(total?.count), query);
    });
  }

  private async legacyFollowUps(
    query: CorgiHomeQuery,
  ): Promise<CorgiPage<CorgiLegacyFollowUp>> {
    return this.safePage(async () => {
      const memberId = query.workspaceMemberId ?? this.actorId();

      if (query.legacyScope !== 'unassigned' && !memberId)
        throw new CorgiHomeUnavailable(
          'Choose a workspace member to see earlier assigned follow-ups',
        );
      const base = this.queries.query('outreachActivity', [
        'id',
        'name',
        'companyId',
        'followUpTaskId',
        'followUpDate',
      ]);

      this.queries.query('task', [
        'id',
        'title',
        'dueAt',
        'status',
        'assigneeId',
      ]);
      this.queries.query('outreachFollowUp', ['id', 'taskId', 'activityId']);
      this.queries.query('company', ['id', 'name']);
      base
        .leftJoin('r.followUpTask', 'legacyTask')
        .leftJoin(
          'legacyTask.followUps',
          'modernTask',
          '"modernTask"."taskId" = "r"."followUpTaskId"',
        )
        .leftJoin(
          'r.followUps',
          'modernActivity',
          '"r"."id" = "modernActivity"."activityId" AND "r"."followUpTaskId" IS NULL',
        )
        .leftJoin('r.company', 'legacyCompany')
        .addSelect('legacyTask.id', 'taskId')
        .addSelect('legacyTask.title', 'taskTitle')
        .addSelect('legacyTask.dueAt', 'taskDueAt')
        .addSelect('legacyTask.status', 'taskStatus')
        .addSelect('legacyCompany.id', 'companyRecordId')
        .addSelect('legacyCompany.name', 'companyName')
        .andWhere(
          '(r.followUpDate IS NOT NULL OR r.followUpTaskId IS NOT NULL)',
        )
        // A later occurrence on the same activity must not hide its older task.
        // When no task exists, a modern activity occurrence already owns the request.
        .andWhere('modernTask.id IS NULL')
        .andWhere(
          '(r.followUpTaskId IS NOT NULL OR modernActivity.id IS NULL)',
        );
      if (query.legacyScope === 'unassigned')
        base.andWhere(
          '(legacyTask.id IS NULL OR legacyTask.assigneeId IS NULL)',
        );
      else
        base.andWhere('legacyTask.assigneeId = :legacyMemberId', {
          legacyMemberId: memberId,
        });
      if (query.status === 'completed')
        base.andWhere('legacyTask.status = :legacyStatus', {
          legacyStatus: 'DONE',
        });
      else if (query.status !== 'all')
        base.andWhere(
          '(legacyTask.status IN (:...legacyStatuses) OR legacyTask.id IS NULL)',
          { legacyStatuses: ['TODO', 'IN_PROGRESS'] },
        );
      this.filterCompany(base, 'outreachActivity', query);
      if (query.search)
        base.andWhere(
          '(r.name ILIKE :legacySearch OR legacyTask.title ILIKE :legacySearch OR legacyCompany.name ILIKE :legacySearch)',
          {
            legacySearch: `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
          },
        );
      const total = await base.clone().getCount();
      const rows = await base
        .orderBy(
          "COALESCE(legacyTask.dueAt, r.followUpDate::timestamp AT TIME ZONE 'America/Chicago')",
          'ASC',
          'NULLS LAST',
        )
        .addOrderBy('r.id', 'ASC')
        .offset(readCorgiOffset(query))
        .limit(CORGI_PAGE_SIZE)
        .getRawMany<Row>();
      const records: CorgiLegacyFollowUp[] = rows.map((row) => ({
        activity: link('outreachActivity', row),
        task: row.taskId
          ? link('task', { id: row.taskId, title: row.taskTitle })
          : null,
        ...(row.taskId
          ? {}
          : {
              taskAvailability: row.followUpTaskId
                ? ('restricted' as const)
                : ('unlinked' as const),
            }),
        company: row.companyRecordId
          ? link('company', { id: row.companyRecordId, name: row.companyName })
          : null,
        ...(row.companyRecordId
          ? {}
          : {
              companyStatus: row.companyId
                ? ('restricted' as const)
                : ('unlinked' as const),
            }),
        dueAt: nullableText(row.taskDueAt),
        followUpDate: nullableText(row.followUpDate),
        status:
          row.taskStatus === 'DONE' ||
          row.taskStatus === 'IN_PROGRESS' ||
          row.taskStatus === 'TODO'
            ? row.taskStatus
            : null,
        schedulerStatus: 'unknown',
      }));

      return page(records, total, query);
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
        'r.status <> :draft',
        { draft: 'DRAFT' },
      );
      this.validMeeting(base);
      this.search(base, 'name', query);
      this.filterCompany(base, 'meetingBooking', query);
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
      const [companies, contacts, owners] = await Promise.all([
        this.relatedBatch(
          'company',
          rows.map((row) => row.companyId),
        ),
        this.relatedBatch(
          'person',
          rows.map((row) => row.contactId),
        ),
        this.relatedBatch(
          'wholesaler',
          rows.map((row) => row.wholesalerId),
        ),
      ]);
      const canMarkTaken = this.queries.canUpdate('meetingBooking', [
        'status',
        'heldAt',
      ]);
      const records: CorgiMeeting[] = rows.map((row) => ({
        ...this.businessRecord('meetingBooking', row),
        scheduledAt: text(row.scheduledAt),
        company: companies.get(text(row.companyId)) ?? null,
        contact: contacts.get(text(row.contactId)) ?? null,
        owner: owners.get(text(row.wholesalerId)) ?? null,
        canMarkTaken: canMarkTaken && row.status === 'BOOKED',
      }));

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
        this.queries.query('companyOwnership', ['companyId', 'wholesalerId']);
        this.queries.query('wholesaler', ['workspaceMemberId']);
        base.andWhere({
          companyOwnerships: {
            wholesaler: { workspaceMemberId: query.workspaceMemberId },
          },
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
      this.search(base, ['nameFirstName', 'nameLastName'], query);
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
      const people = new Map<string, CorgiRecordLink | null>();

      if (ids.length) {
        try {
          const wholesalers = await this.queries
            .query('wholesaler', ['id', 'name', 'workspaceMemberId'])
            .where('r.workspaceMemberId IN (:...ids)', { ids })
            .getRawMany<Row>();

          for (const wholesaler of wholesalers) {
            const memberId = text(wholesaler.workspaceMemberId);

            people.set(
              memberId,
              people.has(memberId) ? null : link('wholesaler', wholesaler),
            );
          }
        } catch (error) {
          this.report(error);
        }
      }
      const records = members.map((member) => {
        const person = people.get(text(member.id)) ?? null;
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
      });

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

  private savedRecordBase(object: string) {
    const base = this.queries.query(object, [
      'id',
      ...labelColumns(object),
      'createdAt',
    ]);
    const name = labelColumns(object)
      .map((column) => `COALESCE(r.${column}, '')`)
      .join(" || ' ' || ");

    base.andWhere(`LOWER(BTRIM(${name})) NOT IN ('', 'untitled')`);
    if (object === 'companyAllocation') this.validAllocation(base);
    if (object === 'meetingBooking') {
      this.validMeeting(base);
      this.queries.query(object, ['bookedAt', 'status']);
      base.andWhere('r.bookedAt IS NOT NULL AND r.status <> :draft', {
        draft: 'DRAFT',
      });
    }
    try {
      // Creator is optional presentation data. Hiding it must not hide an
      // otherwise readable record or expose the actor through another object.
      this.queries.query(object, ['createdByName']);
      base.addSelect('r.createdByName', 'createdByName');
    } catch (error) {
      this.report(error);
    }

    return base;
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
      'task',
      'note',
    ];
    const size = query.section ? CORGI_PAGE_SIZE : 5;
    const sources = await Promise.all(
      objects.map((object) =>
        this.safePage(async () => {
          const base = this.savedRecordBase(object);

          this.search(base, labelColumns(object), query);
          const total = await base.clone().getCount();
          const rows = await applyCorgiFeedBoundary(
            base,
            'createdAt',
            object,
            query,
          )
            .addSelect(corgiFeedTimestamp('createdAt'), 'feedAt')
            .orderBy('r.createdAt', 'DESC')
            .addOrderBy('r.id', 'DESC')
            .limit(size + 1)
            .getRawMany<Row>();

          return {
            status: 'available',
            totalCount: total,
            nextCursor: null,
            records: rows.map((row) => ({
              record: this.businessRecord(object, row),
              source: object,
              at: text(row.feedAt) || text(row.createdAt),
              id: text(row.id),
            })),
          };
        }),
      ),
    );

    return corgiFeedPage(sources, query, size);
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
        effective: 'allocationDate',
        actor: 'loggedById',
      },
    ];
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

          if (definition.kind === 'allocation-logged')
            this.validAllocation(base);
          else {
            this.validMeeting(base);
            this.queries.query('meetingBooking', ['status']);
            if (definition.kind === 'meeting-taken')
              base.andWhere('r.status = :completed AND r.heldAt IS NOT NULL', {
                completed: 'COMPLETED',
              });
            else base.andWhere('r.status <> :draft', { draft: 'DRAFT' });
          }
          if (query.from || query.to)
            this.dateFilter(base, definition.recorded, query);
          this.search(base, labelColumn(definition.object), query);
          const total = await base.clone().getCount();
          const rows = await applyCorgiFeedBoundary(
            base,
            definition.recorded,
            definition.kind,
            query,
          )
            .addSelect(corgiFeedTimestamp(definition.recorded), 'feedAt')
            .orderBy(`r.${definition.recorded}`, 'DESC')
            .addOrderBy('r.id', 'DESC')
            .limit(CORGI_PAGE_SIZE + 1)
            .getRawMany<Row>();
          const actors = await this.relatedBatch(
            'workspaceMember',
            rows.map((row) => row[definition.actor]),
          );
          const records = rows.map((row) => ({
            id: `${definition.kind}:${text(row.id)}`,
            kind: definition.kind,
            record: link(definition.object, row),
            actorName: actors.get(text(row[definition.actor]))?.label ?? null,
            actorWorkspaceMemberId: nullableText(row[definition.actor]),
            recordedAt: text(row[definition.recorded]),
            effectiveAt: text(row[definition.effective]),
            // The source lifecycle proves logging/booking, not initial creation.
            // Local successful-create provenance controls creator celebrations.
            isCreation: false,
          }));

          return {
            status: 'available',
            totalCount: total,
            nextCursor: null,
            records: records.map((record, index) => ({
              record,
              source: definition.kind,
              id: record.record.id,
              at: text(rows[index].feedAt) || record.recordedAt,
            })),
          };
        }),
      ),
    );
    return corgiFeedPage(sources, query, CORGI_PAGE_SIZE);
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
      this.metricRecords('allocations', { allTime: 'true' }),
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
      case 'legacyFollowUps':
        return this.legacyFollowUps(query);
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
