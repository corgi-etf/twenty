import { Injectable } from '@nestjs/common';

import { type CorgiAvailability } from 'twenty-shared/types';

import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

export class CorgiHomeUnavailable extends Error {}

export const corgiErrorAvailability = (error: unknown): CorgiAvailability =>
  error instanceof PermissionsException ? 'denied' : 'unavailable';

/** All CRM projections run as the requesting principal, including relation joins.
 * Explicit permission checks include filter/group columns: they can disclose
 * data even when those columns are not part of the SELECT projection.
 */
@Injectable()
export class CorgiHomeQueryService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  isInstalled(): boolean {
    const { objectIdByNameSingular, flatFieldMetadataMaps } =
      getWorkspaceContext();
    const allocationId = objectIdByNameSingular.companyAllocation;

    return Boolean(
      objectIdByNameSingular.outreachActivity &&
      objectIdByNameSingular.meetingBooking &&
      allocationId &&
      Object.values(flatFieldMetadataMaps.byUniversalIdentifier).some(
        (field) =>
          field?.objectMetadataId === allocationId && field.name === 'loggedAt',
      ),
    );
  }

  query(object: string, columns: string[], alias = 'r') {
    const { objectIdByNameSingular } = getWorkspaceContext();

    if (!objectIdByNameSingular[object])
      throw new CorgiHomeUnavailable(`CRM object ${object} is not installed`);

    const repository = this.workspaceOrmManager.getRepository(object);
    const query = repository.createQueryBuilder(alias);
    const context = repository.getInternalContext();

    for (const column of columns) {
      if (!query.tableShape.columnShapeByColumnName[column])
        throw new CorgiHomeUnavailable(
          `CRM field ${object}.${column} is not installed`,
        );
    }
    validateOperationIsPermittedOrThrow({
      entityName: object,
      operationType: 'select',
      objectsPermissions: repository.objectRecordsPermissions,
      flatObjectMetadataMaps: context.flatObjectMetadataMaps,
      flatFieldMetadataMaps: context.flatFieldMetadataMaps,
      objectIdByNameSingular: context.objectIdByNameSingular,
      selectedColumns: columns,
      updatedColumns: [],
      allFieldsSelected: false,
    });

    query.select([]);
    for (const column of columns) query.addSelect(`${alias}.${column}`, column);

    return query;
  }

  canUpdate(object: string): boolean {
    const id = getWorkspaceContext().objectIdByNameSingular[object];

    return Boolean(
      id &&
      this.workspaceOrmManager.getRepository(object).objectRecordsPermissions[
        id
      ]?.canUpdateObjectRecords,
    );
  }
}
