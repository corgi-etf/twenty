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

    shapes.set(object, result);

    return result;
  };
  const queries = {
    isInstalled: jest.fn(() => true),
    canUpdate: jest.fn(() => true),
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
