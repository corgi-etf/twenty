import {
  FieldType,
  NavigationMenuItemType,
  SystemPermissionFlag,
} from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

import {
  THIRTEEN_F_FILING_IMPORT_PENDING_FILE_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_NODE_ID_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import navigationMenuItem from 'src/navigation-menu-items/thirteen-f-filings.navigation-menu-item';
import filingObject from 'src/objects/thirteen-f-filing.object';
import defaultRole from 'src/roles/default-role';
import filingsView from 'src/views/thirteen-f-filings.view';

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
    expect(defaultRole.config.objectPermissions).toEqual([
      expect.objectContaining({
        objectUniversalIdentifier: filingObject.config.universalIdentifier,
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      }),
    ]);
  });
});
