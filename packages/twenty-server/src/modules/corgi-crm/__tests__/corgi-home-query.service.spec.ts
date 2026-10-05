import { FieldMetadataType, MetadataWritability } from 'twenty-shared/types';

import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CorgiHomeQueryService } from 'src/modules/corgi-crm/corgi-home-query.service';

jest.mock('src/engine/twenty-orm/workspace-orm.manager', () => ({
  WorkspaceOrmManager: class {},
}));
jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
);
jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: () => ({ type: 'user' }) }),
);

const makeQueries = ({
  canRead = true,
  canUpdate = true,
  fieldRead = true,
  fieldUpdate = true,
  writability = MetadataWritability.OPEN,
} = {}) => {
  const context = {
    objectIdByNameSingular: { outreachFollowUp: 'object-id' },
    flatObjectMetadataMaps: {
      universalIdentifierById: { 'object-id': 'object' },
      byUniversalIdentifier: {
        object: {
          id: 'object-id',
          universalIdentifier: 'object',
          nameSingular: 'outreachFollowUp',
          fieldIds: ['status-id'],
          isSystem: false,
        },
      },
    },
    flatFieldMetadataMaps: {
      universalIdentifierById: { 'status-id': 'status' },
      byUniversalIdentifier: {
        status: {
          id: 'status-id',
          name: 'status',
          type: FieldMetadataType.TEXT,
          writability,
        },
      },
    },
  };
  jest
    .mocked(getWorkspaceContext)
    .mockReturnValue(
      context as unknown as ReturnType<typeof getWorkspaceContext>,
    );
  const query = {
    tableShape: { columnShapeByColumnName: { status: {} } },
    select: jest.fn(),
    addSelect: jest.fn(),
  };
  const repository = {
    createQueryBuilder: () => query,
    getInternalContext: () => context,
    objectRecordsPermissions: {
      'object-id': {
        canReadObjectRecords: canRead,
        canUpdateObjectRecords: canUpdate,
        restrictedFields: {
          'status-id': { canRead: fieldRead, canUpdate: fieldUpdate },
        },
      },
    },
  };
  return new CorgiHomeQueryService({
    getRepository: () => repository,
  } as unknown as WorkspaceOrmManager);
};

describe('CRM projection permission foundation', () => {
  it('rejects unreadable filter fields even if object records are readable', () => {
    expect(() =>
      makeQueries({ fieldRead: false }).query('outreachFollowUp', ['status']),
    ).toThrow();
  });

  it.each([
    { canRead: false },
    { canUpdate: false },
    { fieldRead: false },
    { fieldUpdate: false },
    { writability: MetadataWritability.APPLICATION },
  ])('does not offer a completion write denied by %j', (permissions) => {
    expect(
      makeQueries(permissions).canUpdate('outreachFollowUp', ['status']),
    ).toBe(false);
  });

  it('offers completion when the actual status field is readable and writable', () => {
    expect(makeQueries().canUpdate('outreachFollowUp', ['status'])).toBe(true);
  });

  it('does not offer an action when its required field is not installed', () => {
    expect(makeQueries().canUpdate('outreachFollowUp', ['heldAt'])).toBe(false);
  });
});
