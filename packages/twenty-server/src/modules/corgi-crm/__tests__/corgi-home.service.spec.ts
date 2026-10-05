import { type CorgiClientCompany, type CorgiPage } from 'twenty-shared/types';

import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { buildColumn } from 'src/engine/twenty-orm/query-builder/__tests__/workspace-select-query-builder-test-shapes.util';
import { WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import { type CompiledStatement } from 'src/engine/twenty-orm/sql/utils/compile-named-parameters.util';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type CorgiHomeQueryService } from 'src/modules/corgi-crm/corgi-home-query.service';
import { corgiPageCursor } from 'src/modules/corgi-crm/corgi-home.utils';
import { CorgiHomeService } from 'src/modules/corgi-crm/corgi-home.service';

jest.mock('src/engine/twenty-orm/workspace-orm.manager', () => ({
  WorkspaceOrmManager: class {},
}));
jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: () => ({
      type: 'user',
      workspaceMemberId: '10000000-0000-4000-8000-000000000001',
    }),
  }),
);

const makeService = (
  rows: (statement: CompiledStatement) => Record<string, unknown>[] = () => [],
) => {
  const statements: CompiledStatement[] = [];
  const shapes = new Map<string, WorkspaceTableShape>();
  const shape = (object: string, columns: string[] = []) => {
    const previous = shapes.get(object);
    const names = [
      ...new Set([
        ...(previous?.columnNames ?? []),
        'id',
        'deletedAt',
        ...columns,
      ]),
    ];
    const result: WorkspaceTableShape = {
      objectMetadataId: object,
      nameSingular: object,
      schemaName: 'workspace_scoped',
      tableName: object,
      columnNames: names,
      columnShapeByColumnName: Object.fromEntries(
        names.map((name) => [name, buildColumn(name)]),
      ),
      hasDeletedAtColumn: true,
      relationShapeByFieldName: Object.fromEntries(
        Object.entries({
          company: 'company',
          contact: 'person',
          externalWholesaler: 'wholesaler',
          wholesaler: 'wholesaler',
          followUpTask: 'task',
          task: 'task',
          activity: 'outreachActivity',
        }).map(([relation, target]) => [
          relation,
          {
            fieldName: relation,
            fieldMetadataId: relation,
            targetFieldMetadataId: `${relation}-inverse`,
            targetObjectMetadataId: target,
            relationType: RelationType.MANY_TO_ONE,
            joinColumnName: `${relation}Id`,
          },
        ]),
      ),
    };

    if (object === 'task' || object === 'outreachActivity') {
      result.relationShapeByFieldName.followUps = {
        fieldName: 'followUps',
        fieldMetadataId: `${object}-followUps`,
        targetFieldMetadataId: object === 'task' ? 'task' : 'activity',
        targetObjectMetadataId: 'outreachFollowUp',
        relationType: RelationType.ONE_TO_MANY,
      };
    }
    shapes.set(object, result);

    return result;
  };
  const queries = {
    isInstalled: jest.fn(() => true),
    canUpdate: jest.fn((_object: string, _columns?: string[]) => true),
    query: jest.fn((object: string, columns: string[]) => {
      const query = new WorkspaceSelectQueryBuilder('r', {
        tableShape: shape(object, columns),
        objectRecordsPermissions: {},
        tableShapeByObjectMetadataId: (id) => shape(id),
        executor: {
          execute: async (statement) => {
            statements.push(statement);
            return rows(statement);
          },
        },
        onBeforeExecute: (builder) => {
          builder.andWhere('r.id <> :hiddenId', {
            hiddenId: 'row-hidden-by-policy',
          });
        },
        formatResult: (records) => records as never,
      });

      query.select([]);
      columns.forEach((column) => query.addSelect(`r.${column}`, column));

      return query;
    }),
  };
  const orm = {
    executeInWorkspaceContext: async (work: () => Promise<unknown>) => work(),
  };

  return {
    service: new CorgiHomeService(
      orm as unknown as WorkspaceOrmManager,
      queries as unknown as CorgiHomeQueryService,
    ),
    statements,
    queries,
  };
};

describe('CRM permission-scoped dashboard projections', () => {
  it('uses completed held time for taken meetings and the caller ORM scope for both count and rows', async () => {
    const { service, statements } = makeService((sql) =>
      sql.text.includes('COUNT(') ? [{ count: '3' }] : [],
    );
    const result = await service.get({
      section: 'meetingsTaken',
      from: '2026-03-08',
      to: '2026-03-08',
    });

    expect(result).toMatchObject({ status: 'available', totalCount: 3 });
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.text).toContain('"r"."heldAt"');
      expect(statement.text).toContain('"r"."status"');
      expect(statement.values).toEqual(
        expect.arrayContaining([
          'COMPLETED',
          '2026-03-08T06:00:00.000Z',
          '2026-03-09T05:00:00.000Z',
          'row-hidden-by-policy',
        ]),
      );
    }
  });

  it('preserves all-time company/person allocation drilldowns', async () => {
    const { service, statements } = makeService();

    await service.get({
      section: 'allocations',
      allTime: 'true',
      companyId: '20000000-0000-4000-8000-000000000002',
      contactId: '30000000-0000-4000-8000-000000000003',
    });
    expect(
      statements.every(
        (sql) =>
          !sql.text.includes('>=') &&
          sql.text.includes('"r"."loggedAt" IS NOT NULL'),
      ),
    ).toBe(true);
    expect(statements[0].values).toContain(
      '30000000-0000-4000-8000-000000000003',
    );
  });

  it('counts distinct companies, then returns exact currency and attribution aggregates', async () => {
    const { service, statements } = makeService((sql) => {
      if (sql.text.includes('COUNT(DISTINCT')) return [{ count: '1' }];
      if (sql.text.includes('MAX('))
        return [
          {
            id: 'company-a',
            name: 'Acme',
            count: '3',
            lastAt: '2026-10-05T13:00:00.000Z',
          },
        ];
      if (sql.text.includes('AS "unassigned"'))
        return [
          {
            id: null,
            unassigned: true,
            count: '3',
            companyId: 'company-a',
            currencyCode: 'USD',
            amountMicros: '9007199254740993',
          },
        ];
      if (sql.text.includes('SUM('))
        return [
          {
            companyId: 'company-a',
            currencyCode: 'USD',
            amountMicros: '9007199254740993',
          },
        ];

      return [];
    });
    const result = (await service.get({
      section: 'currentClients',
    })) as CorgiPage<CorgiClientCompany>;

    expect(result.totalCount).toBe(1);
    expect(result.records[0].allocationCount).toBe(3);
    expect(result.records[0].amounts[0].amountMicros).toBe('9007199254740993');
    expect(result.records[0].contacts[0]).toMatchObject({
      person: null,
      attributionStatus: 'unassigned',
      allocationCount: 3,
    });
    expect(statements[0].text).toContain('COUNT(DISTINCT "company"."id")');
    expect(statements[0].text).toContain('INNER JOIN');
    expect(statements[0].text).not.toContain('activeClient');
  });

  it('never represents denied allocation data as zero', async () => {
    const { service, queries } = makeService();

    queries.query.mockImplementation(() => {
      throw new PermissionsException(
        'Denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    });
    expect(await service.get({ section: 'currentClients' })).toEqual({
      status: 'denied',
      records: [],
      totalCount: null,
      nextCursor: null,
    });
  });

  it('keeps future followups and filters history by original scheduler', async () => {
    const { service, statements } = makeService();

    await service.get({
      section: 'followUps',
      status: 'all',
      scope: 'scheduled',
      companyId: 'unlinked',
    });
    expect(statements[0].text).toContain('"r"."scheduledById"');
    expect(statements[0].text).toContain('"r"."companyId" IS NULL');
    expect(statements[0].text).not.toContain('"r"."dueAt" <');
    expect(statements[0].values).not.toContain('OPEN');
  });
});

describe('CRM corrected-record validity', () => {
  it('applies business validity to allocation records and persisted wins before async reconciliation', async () => {
    const { service, statements } = makeService();
    await service.get({ section: 'allocations', allTime: 'true' });
    await service.get({ section: 'liveWins' });
    const allocationStatements = statements.filter((statement) =>
      statement.text.includes('"companyAllocation"'),
    );
    expect(allocationStatements.length).toBeGreaterThan(2);
    for (const statement of allocationStatements) {
      expect(statement.text).toContain('"r"."companyId" IS NOT NULL');
      expect(statement.text).toContain('BTRIM("r"."ticker")');
      expect(statement.text).toContain('"r"."amountAmountMicros" > 0');
      expect(statement.text).toContain('"r"."allocationValidationMessage"');
    }
  });

  it('filters unassigned attribution using NULL without treating the sentinel as a UUID', async () => {
    const { service, statements } = makeService();
    await service.get({
      section: 'allocations',
      allTime: 'true',
      contactId: 'unassigned',
    });
    expect(statements[0].text).toContain('"r"."contactId" IS NULL');
    expect(statements[0].values).not.toContain('unassigned');
  });

  it('checks the actual completion fields before presenting a write action', async () => {
    const { service, queries } = makeService((statement) =>
      statement.text.includes('COUNT(')
        ? [{ count: 1 }]
        : [{ id: 'reminder', name: 'Call', status: 'OPEN' }],
    );
    await service.get({ section: 'followUps' });
    expect(queries.canUpdate).toHaveBeenCalledWith('outreachFollowUp', [
      'status',
    ]);
  });
});

describe('CRM batched relationships and company visibility', () => {
  it('resolves a full follow-up page in five queries, not three lookups per reminder', async () => {
    const { service, statements } = makeService((statement) => {
      if (statement.text.includes('COUNT(')) return [{ count: 25 }];
      if (statement.text.includes('"outreachFollowUp"'))
        return Array.from({ length: 25 }, (_, index) => ({
          id: `followup-${index}`,
          name: 'Call',
          status: 'OPEN',
          companyId: `company-${index}`,
          contactId: `contact-${index}`,
          activityId: `activity-${index}`,
        }));
      return [];
    });
    const result = await service.get({ section: 'followUps' });
    expect(result).toMatchObject({ totalCount: 25 });
    expect(statements).toHaveLength(5);
    expect(
      statements
        .slice(2)
        .every((statement) => statement.text.includes(' IN (')),
    ).toBe(true);
  });

  it('preserves restricted companies separately from the needs-company-link queue', async () => {
    const { service, statements } = makeService((statement) => {
      if (statement.text.includes('COUNT(DISTINCT')) return [{ count: 2 }];
      if (statement.text.includes('AS "reminderIds"'))
        return [
          {
            id: null,
            unlinked: false,
            reminderIds: ['restricted-reminder'],
            openCount: 1,
            totalCount: 1,
          },
          {
            id: null,
            unlinked: true,
            reminderIds: ['unlinked-reminder'],
            openCount: 1,
            totalCount: 1,
          },
        ];
      if (
        statement.text.includes('"outreachFollowUp"') &&
        statement.text.includes(' IN (')
      )
        return [
          {
            id: 'restricted-reminder',
            companyId: 'hidden-company',
            name: 'Private call',
            status: 'OPEN',
          },
          {
            id: 'unlinked-reminder',
            companyId: null,
            name: 'Link a company',
            status: 'OPEN',
          },
        ];
      return [];
    });
    const result = await service.get({ section: 'followUpCompanies' });
    expect(result).toMatchObject({
      records: [
        {
          company: null,
          companyStatus: 'restricted',
          reminders: [
            { id: 'restricted-reminder', companyStatus: 'restricted' },
          ],
        },
        {
          company: null,
          companyStatus: 'unlinked',
          reminders: [{ id: 'unlinked-reminder', companyStatus: 'unlinked' }],
        },
      ],
    });
    expect(statements[0].text).toContain('CASE WHEN');
    expect(statements[1].text).toContain('[1 : 5]');
    expect(statements.length).toBeLessThanOrEqual(7);
  });

  it('filters the restricted-company drilldown using the permitted relation join', async () => {
    const { service, statements } = makeService();
    await service.get({ section: 'followUps', companyId: 'restricted' });
    expect(statements[0].text).toContain('LEFT JOIN');
    expect(statements[0].text).toContain('"r"."companyId" IS NOT NULL');
    expect(statements[0].text).toContain('"visibleCompany"."id" IS NULL');
    expect(statements[0].values).not.toContain('restricted');
  });
});

describe('CRM complete business feeds', () => {
  it('includes tasks, notes and readable creator snapshots while excluding draft placeholders', async () => {
    const { service, statements } = makeService((statement) => {
      if (statement.text.includes('COUNT(')) return [{ count: 1 }];
      if (statement.text.includes('"task"'))
        return [
          {
            id: '10000000-0000-4000-8000-000000000001',
            title: 'Call client',
            createdAt: '2026-10-05T15:00:00.000Z',
            createdByName: 'Creator',
          },
        ];
      if (statement.text.includes('"note"'))
        return [
          {
            id: '10000000-0000-4000-8000-000000000002',
            title: 'Client context',
            createdAt: '2026-10-05T14:00:00.000Z',
          },
        ];
      return [];
    });
    const result = await service.get({ section: 'latestRecords' });
    expect(result).toMatchObject({
      records: [
        {
          objectNameSingular: 'task',
          label: 'Call client',
          createdBy: 'Creator',
        },
        { objectNameSingular: 'note', label: 'Client context' },
      ],
    });
    expect(
      statements
        .filter((statement) => statement.text.includes('"meetingBooking"'))
        .every((statement) =>
          statement.text.includes('"r"."bookedAt" IS NOT NULL'),
        ),
    ).toBe(true);
    expect(
      statements
        .filter((statement) => statement.text.includes('"company" AS "r"'))
        .every((statement) => statement.text.includes('BTRIM')),
    ).toBe(true);
  });

  it('requires completion reconciliation and a clear validation state for taken metrics', async () => {
    const { service, statements } = makeService();
    await service.get({ section: 'meetingsTaken' });
    expect(statements[0].text).toContain('"r"."heldRecordedAt" IS NOT NULL');
    expect(statements[0].text).toContain('"r"."bookingValidationMessage"');
  });

  it('keeps completed and cancelled meetings visible in the agenda and searches their names', async () => {
    const { service, statements } = makeService();
    await service.get({ section: 'agenda', search: 'Client' });
    expect(statements[0].values).toContain('DRAFT');
    expect(statements[0].values).not.toContain('BOOKED');
    expect(statements[0].values).toContain('%Client%');
  });
});

describe('CRM feed query bounds', () => {
  it('keeps a deep mixed-feed page bounded instead of reading every preceding record', async () => {
    const { service, statements } = makeService();
    const query = { section: 'latestRecords' as const };
    const cursor = corgiPageCursor(500000, query, {
      at: '2026-10-05T15:00:00.123456Z',
      id: '10000000-0000-4000-8000-000000000001',
      source: 'task',
    });
    await service.get({ ...query, cursor });
    const recordQueries = statements.filter(
      (statement) => !statement.text.includes('COUNT('),
    );
    expect(recordQueries).toHaveLength(9);
    for (const statement of recordQueries) {
      expect(statement.text).toContain('"r"."createdAt" <');
      expect(statement.text).toContain('to_char(');
      expect(statement.values).toContain(26);
      expect(statement.values).not.toContain(500025);
      expect(statement.values).toContain('2026-10-05T15:00:00.123456Z');
    }
  });
});

describe('CRM team aggregate query bounds', () => {
  it('returns zero-work employees with eight queries for an entire team page', async () => {
    const { service, statements } = makeService((statement) => {
      if (
        statement.text.includes('FROM "workspace_scoped"."workspaceMember"')
      ) {
        if (statement.text.includes('COUNT(')) return [{ count: 25 }];
        return Array.from({ length: 25 }, (_, index) => ({
          id: `member-${index}`,
          nameFirstName: `Employee ${index}`,
          nameLastName: '',
        }));
      }
      return [];
    });
    const result = await service.get({ section: 'team' });
    expect(result).toMatchObject({
      totalCount: 25,
      records: expect.arrayContaining([
        expect.objectContaining({
          workspaceMemberId: 'member-24',
          activities: { status: 'available', count: 0 },
          allocations: { status: 'available', count: 0, amounts: [] },
        }),
      ]),
    });
    expect(statements).toHaveLength(8);
    expect(
      statements.filter((statement) => statement.text.includes('GROUP BY')),
    ).toHaveLength(5);
  });
});

describe('CRM earlier follow-up history', () => {
  it('returns a denied section without running source queries when native task attribution cannot be read', async () => {
    const { service, queries, statements } = makeService();
    const originalQuery = queries.query.getMockImplementation()!;

    queries.query.mockImplementation((object, columns) => {
      if (object === 'task')
        throw new PermissionsException(
          'Task assignee is restricted',
          PermissionsExceptionCode.PERMISSION_DENIED,
        );

      return originalQuery(object, columns);
    });
    expect(await service.get({ section: 'legacyFollowUps' })).toEqual({
      status: 'denied',
      records: [],
      totalCount: null,
      nextCursor: null,
    });
    expect(statements).toHaveLength(0);
  });

  it('scopes earlier work only by native task assignee and excludes the exact modern task, keeping its original due time', async () => {
    const { service, statements } = makeService((statement) => {
      if (statement.text.includes('COUNT(')) return [{ count: 1 }];
      return [
        {
          id: 'activity',
          name: 'Earlier outreach',
          companyId: 'company',
          companyRecordId: 'company',
          companyName: 'Original company',
          taskId: 'task',
          taskTitle: 'Earlier reminder',
          taskStatus: 'TODO',
          taskDueAt: '2026-12-01T15:00:00.000Z',
          followUpDate: '2027-01-01',
        },
      ];
    });
    const result = await service.get({
      section: 'legacyFollowUps',
      workspaceMemberId: '10000000-0000-4000-8000-000000000001',
      status: 'all',
    });
    expect(result).toMatchObject({
      totalCount: 1,
      records: [
        {
          activity: { id: 'activity' },
          task: { id: 'task' },
          company: { id: 'company' },
          dueAt: '2026-12-01T15:00:00.000Z',
          status: 'TODO',
          schedulerStatus: 'unknown',
        },
      ],
    });
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement.text).toContain('"legacyTask"."assigneeId"');
      expect(statement.text).toContain('"modernTask"."taskId"');
      expect(statement.text).toContain('"modernTask"."id" IS NULL');
      expect(statement.text).not.toContain('"r"."wholesalerId"');
      expect(statement.text).not.toContain('"r"."scheduledById"');
      expect(statement.text).not.toContain('"legacyTask"."dueAt" <');
      expect(statement.values).toContain('row-hidden-by-policy');
    }
  });

  it('keeps missing-task work in a shared queue without assigning it to a guessed person', async () => {
    const { service, statements } = makeService();
    await service.get({
      section: 'legacyFollowUps',
      legacyScope: 'unassigned',
      status: 'all',
    });
    expect(statements[0].text).toContain('"r"."followUpTaskId" IS NULL');
    expect(statements[0].text).toContain('"legacyTask"."assigneeId" IS NULL');
    expect(statements[0].text).toContain('"modernActivity"."id" IS NULL');
    expect(statements[0].values).not.toContain(
      '10000000-0000-4000-8000-000000000001',
    );
    await expect(
      service.get({
        section: 'legacyFollowUps',
        legacyScope: 'unassigned',
        workspaceMemberId: '10000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow();
  });
});
