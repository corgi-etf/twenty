import {
  FieldType,
  NavigationMenuItemType,
  SystemPermissionFlag,
  ViewFilterOperand,
} from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import {
  THIRTEEN_F_IMPORT_ERROR_IDS,
  THIRTEEN_F_FILING_IMPORT_PENDING_FILE_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_NODE_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_RUN_IDS,
  THIRTEEN_F_MANAGER_IDS,
  THIRTEEN_F_POSITION_IDS,
  THIRTEEN_F_SECURITY_IDS,
} from 'src/constants/universal-identifiers';
import errorsOnImportRunField from 'src/fields/thirteen-f-errors-on-import-run.field';
import importRunsOnFilingField from 'src/fields/thirteen-f-import-runs-on-filing.field';
import positionsOnFilingField from 'src/fields/thirteen-f-positions-on-filing.field';
import positionsOnImportRunField from 'src/fields/thirteen-f-positions-on-import-run.field';
import positionsOnManagerField from 'src/fields/thirteen-f-positions-on-manager.field';
import positionsOnSecurityField from 'src/fields/thirteen-f-positions-on-security.field';
import holdingsNavigationMenuItem from 'src/navigation-menu-items/thirteen-f-holdings.navigation-menu-item';
import importsNavigationMenuItem from 'src/navigation-menu-items/thirteen-f-import-runs.navigation-menu-item';
import managersNavigationMenuItem from 'src/navigation-menu-items/thirteen-f-managers.navigation-menu-item';
import securitiesNavigationMenuItem from 'src/navigation-menu-items/thirteen-f-securities.navigation-menu-item';
import navigationMenuItem from 'src/navigation-menu-items/thirteen-f-filings.navigation-menu-item';
import filingObject from 'src/objects/thirteen-f-filing.object';
import holdingObject from 'src/objects/thirteen-f-holding.object';
import importErrorObject from 'src/objects/thirteen-f-import-error.object';
import importRunObject from 'src/objects/thirteen-f-import-run.object';
import managerObject from 'src/objects/thirteen-f-manager.object';
import securityObject from 'src/objects/thirteen-f-security.object';
import defaultRole from 'src/roles/default-role';
import filingsView from 'src/views/thirteen-f-filings.view';
import holdingsView from 'src/views/thirteen-f-holdings.view';
import importsView from 'src/views/thirteen-f-import-runs.view';
import managersView from 'src/views/thirteen-f-managers.view';
import securitiesView from 'src/views/thirteen-f-securities.view';

describe('13F library manifest', () => {
  it('defines the stable REST object and native file contract', () => {
    expect(filingObject.success).toBe(true);
    expect(filingObject.config).toMatchObject({
      nameSingular: 'thirteenFFiling',
      namePlural: 'thirteenFFilings',
    });

    const fields = filingObject.config.fields;

    expect(fields.map(({ name }) => name)).toEqual([
      'name',
      'ticker',
      'managerName',
      'reportPeriod',
      'file',
      'importPendingFileId',
      'sourceDriveId',
      'sourceNodeId',
      'sourceVersionId',
      'sourceUpdatedAt',
      'sourceLink',
    ]);
    expect(fields.find(({ name }) => name === 'file')).toMatchObject({
      type: FieldType.FILES,
      universalSettings: { maxNumberOfValues: 1 },
    });
    expect(
      fields.find(({ name }) => name === 'importPendingFileId'),
    ).toMatchObject({
      universalIdentifier:
        THIRTEEN_F_FILING_IMPORT_PENDING_FILE_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      isNullable: true,
    });
    expect(fields.find(({ name }) => name === 'sourceNodeId')).toMatchObject({
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_NODE_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      isNullable: true,
      isUnique: true,
    });
  });

  it('defines app-owned searchable holdings, firms, securities, and imports', () => {
    expect(managerObject.config).toMatchObject({
      nameSingular: 'thirteenFManager',
      namePlural: 'thirteenFManagers',
    });
    expect(securityObject.config).toMatchObject({
      nameSingular: 'thirteenFSecurity',
      namePlural: 'thirteenFSecurities',
    });
    expect(holdingObject.config).toMatchObject({
      nameSingular: 'thirteenFHolding',
      namePlural: 'thirteenFHoldings',
      labelPlural: '13F Holdings',
    });
    expect(importRunObject.config).toMatchObject({
      nameSingular: 'thirteenFImportRun',
      namePlural: 'thirteenFImportRuns',
    });
    expect(importErrorObject.config).toMatchObject({
      nameSingular: 'thirteenFImportError',
      namePlural: 'thirteenFImportErrors',
    });
    expect(
      holdingObject.config.fields.find(({ name }) => name === 'positionKey'),
    ).toMatchObject({ type: FieldType.TEXT });
    expect(
      holdingObject.config.fields.find(({ name }) => name === 'positionKey'),
    ).not.toMatchObject({ isUnique: true });
    expect(
      holdingObject.config.fields.find(({ name }) => name === 'searchText'),
    ).toMatchObject({ type: FieldType.TEXT });
    expect(
      managerObject.config.fields.find(({ name }) => name === 'normalizedName'),
    ).toMatchObject({ isUnique: true, type: FieldType.TEXT });
    expect(
      securityObject.config.fields.find(({ name }) => name === 'ticker'),
    ).toMatchObject({ isUnique: true, type: FieldType.TEXT });
    expect(
      importRunObject.config.fields.find(({ name }) => name === 'importKey'),
    ).toMatchObject({ isUnique: true, type: FieldType.TEXT });
  });

  it('exposes the document library as a native CRM table', () => {
    expect(filingsView.success).toBe(true);
    expect(filingsView.config.fields).toHaveLength(6);
    const viewFields = filingsView.config.fields ?? [];

    expect(
      viewFields.map(
        ({ fieldMetadataUniversalIdentifier }) =>
          fieldMetadataUniversalIdentifier,
      ),
    ).not.toContain(
      THIRTEEN_F_FILING_IMPORT_PENDING_FILE_ID_FIELD_UNIVERSAL_IDENTIFIER,
    );
    expect(navigationMenuItem.success).toBe(true);
    expect(navigationMenuItem.config.type).toBe(NavigationMenuItemType.VIEW);
    expect(navigationMenuItem.config.viewUniversalIdentifier).toBe(
      filingsView.config.universalIdentifier,
    );
  });

  it('exposes normalized data through native CRM navigation tables', () => {
    expect(holdingsView.config.objectUniversalIdentifier).toBe(
      THIRTEEN_F_POSITION_IDS.object,
    );
    expect(managersView.config.objectUniversalIdentifier).toBe(
      THIRTEEN_F_MANAGER_IDS.object,
    );
    expect(securitiesView.config.objectUniversalIdentifier).toBe(
      THIRTEEN_F_SECURITY_IDS.object,
    );
    expect(importsView.config.objectUniversalIdentifier).toBe(
      THIRTEEN_F_IMPORT_RUN_IDS.object,
    );
    expect(
      [
        holdingsNavigationMenuItem,
        managersNavigationMenuItem,
        securitiesNavigationMenuItem,
        importsNavigationMenuItem,
      ].map(({ config }) => config.type),
    ).toEqual(Array(4).fill(NavigationMenuItemType.VIEW));
    expect(navigationMenuItem.config.position).toBe(4);
    expect(securitiesView.config.fields?.[0]).toMatchObject({
      fieldMetadataUniversalIdentifier: THIRTEEN_F_SECURITY_IDS.name,
      position: 0,
    });
  });

  it('defines both sides of every app relation', () => {
    expect(
      [
        positionsOnManagerField,
        positionsOnSecurityField,
        positionsOnImportRunField,
        positionsOnFilingField,
        importRunsOnFilingField,
        errorsOnImportRunField,
      ].map(({ config }) => config),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_MANAGER_IDS.positions,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_POSITION_IDS.manager,
        }),
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_SECURITY_IDS.positions,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_POSITION_IDS.security,
        }),
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.positions,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_POSITION_IDS.importRun,
        }),
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_POSITION_IDS.filingPositions,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_POSITION_IDS.filing,
        }),
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.filingImportRuns,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_IMPORT_RUN_IDS.filing,
        }),
        expect.objectContaining({
          universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.importRunErrors,
          relationTargetFieldMetadataUniversalIdentifier:
            THIRTEEN_F_IMPORT_ERROR_IDS.importRun,
        }),
      ]),
    );
  });

  it('shows only active holdings in the native holdings table', () => {
    expect(holdingsView.config.filters).toEqual([
      {
        universalIdentifier: THIRTEEN_F_POSITION_IDS.activeViewFilter,
        fieldMetadataUniversalIdentifier: THIRTEEN_F_POSITION_IDS.isActive,
        operand: ViewFilterOperand.IS,
        value: true,
      },
    ]);
  });

  it('limits the app role to 13F records and file upload', () => {
    expect(defaultRole.success).toBe(true);
    expect(defaultRole.config).toMatchObject({
      canReadAllObjectRecords: false,
      canUpdateAllObjectRecords: false,
      canSoftDeleteAllObjectRecords: false,
      canDestroyAllObjectRecords: false,
      canBeAssignedToUsers: false,
      permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
    });
    expect(defaultRole.config.objectPermissions).toHaveLength(6);
    expect(
      defaultRole.config.objectPermissions?.map(
        ({ objectUniversalIdentifier }) => objectUniversalIdentifier,
      ),
    ).toEqual([
      filingObject.config.universalIdentifier,
      THIRTEEN_F_MANAGER_IDS.object,
      THIRTEEN_F_SECURITY_IDS.object,
      THIRTEEN_F_POSITION_IDS.object,
      THIRTEEN_F_IMPORT_RUN_IDS.object,
      THIRTEEN_F_IMPORT_ERROR_IDS.object,
    ]);
    expect(defaultRole.config.objectPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        }),
      ]),
    );
  });
});
