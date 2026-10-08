import { Injectable } from '@nestjs/common';

import { type CorgiAvailability } from 'twenty-shared/types';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

export class CorgiHomeUnavailable extends Error {}

export const corgiErrorAvailability = (error: unknown): CorgiAvailability =>
  error instanceof PermissionsException ? 'denied' : 'unavailable';

// All projections run as the requesting principal, including relation joins.
// Check filter/group fields explicitly: they disclose data even outside SELECT.
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

  // getRepository without a role config resolves to an empty permission map
  // with bypass disabled, so every select is refused and the dashboard reports
  // "No access" to everyone regardless of their role. Run as the requesting
  // principal's role, which the ORM context already carries, so the projections
  // are scoped the way the comment above this class says they are.
  private requestingRolePermissionConfig(): RolePermissionConfig {
    const { authContext, userWorkspaceRoleMap, apiKeyRoleMap } =
      getWorkspaceContext();
    const roleId =
      authContext.type === 'user'
        ? userWorkspaceRoleMap[authContext.userWorkspaceId]
        : authContext.type === 'apiKey'
          ? apiKeyRoleMap[authContext.apiKey.id]
          : authContext.type === 'application'
            ? authContext.application.defaultRoleId
            : undefined;

    if (typeof roleId !== 'string' || roleId.length === 0)
      throw new CorgiHomeUnavailable(
        `No role is bound to the ${authContext.type} principal`,
      );

    return { unionOf: [roleId] };
  }

  query(object: string, columns: string[], alias = 'r') {
    const { objectIdByNameSingular } = getWorkspaceContext();

    if (!objectIdByNameSingular[object])
      throw new CorgiHomeUnavailable(`CRM object ${object} is not installed`);

    const repository = this.workspaceOrmManager.getRepository(
      object,
      this.requestingRolePermissionConfig(),
    );
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

  canUpdate(object: string, columns: string[]): boolean {
    try {
      const repository = this.workspaceOrmManager.getRepository(
        object,
        this.requestingRolePermissionConfig(),
      );
      const context = repository.getInternalContext();

      // A missing field is not writable, even if the role allows the object.
      this.query(object, columns);
      validateOperationIsPermittedOrThrow({
        entityName: object,
        operationType: 'update',
        objectsPermissions: repository.objectRecordsPermissions,
        flatObjectMetadataMaps: context.flatObjectMetadataMaps,
        flatFieldMetadataMaps: context.flatFieldMetadataMaps,
        objectIdByNameSingular: context.objectIdByNameSingular,
        selectedColumns: columns,
        updatedColumns: columns,
        allFieldsSelected: false,
        authContext: getWorkspaceAuthContext(),
      });

      return true;
    } catch {
      return false;
    }
  }
}
