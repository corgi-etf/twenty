import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';
import { describe, expect, it } from 'vitest';

const WHOLESALER_OBJECT_ID = '33333333-3333-4333-8333-333333333333';
const OUTREACH_ACTIVITY_OBJECT_ID =
  '44444444-4444-4444-8444-444444444444';

process.env.CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER =
  WHOLESALER_OBJECT_ID;
process.env.CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER =
  OUTREACH_ACTIVITY_OBJECT_ID;
const { default: defaultRole } = await import('src/default-role');

const permissionFor = (objectUniversalIdentifier: string) =>
  defaultRole.config.objectPermissions?.find(
    (permission) =>
      permission.objectUniversalIdentifier === objectUniversalIdentifier,
  );

describe('Corgi CRM function role', () => {
  it('disables global record and settings permissions', () => {
    expect(defaultRole.success).toBe(true);
    expect(defaultRole.config).toMatchObject({
      canReadAllObjectRecords: false,
      canUpdateAllObjectRecords: false,
      canSoftDeleteAllObjectRecords: false,
      canDestroyAllObjectRecords: false,
      canUpdateAllSettings: false,
    });
  });

  it('reads only the five required objects and writes only app-owned activity and wholesaler data', () => {
    const readOnly = [
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
        .universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
    ];
    for (const objectUniversalIdentifier of readOnly) {
      expect(permissionFor(objectUniversalIdentifier)).toEqual({
        objectUniversalIdentifier,
        canReadObjectRecords: true,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      });
    }
    for (const objectUniversalIdentifier of [
      WHOLESALER_OBJECT_ID,
      OUTREACH_ACTIVITY_OBJECT_ID,
    ]) {
      expect(permissionFor(objectUniversalIdentifier)).toEqual({
        objectUniversalIdentifier,
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      });
    }
    expect(defaultRole.config.objectPermissions).toHaveLength(5);
  });
});
