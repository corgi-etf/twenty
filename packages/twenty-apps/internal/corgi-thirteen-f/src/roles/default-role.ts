import { defineApplicationRole, SystemPermissionFlag } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_ERROR_IDS,
  THIRTEEN_F_IMPORT_RUN_IDS,
  THIRTEEN_F_MANAGER_IDS,
  THIRTEEN_F_POSITION_IDS,
  THIRTEEN_F_SECURITY_IDS,
} from 'src/constants/universal-identifiers';

export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `Least-privilege role for ${APP_DISPLAY_NAME} operations`,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
    THIRTEEN_F_MANAGER_IDS.object,
    THIRTEEN_F_SECURITY_IDS.object,
    THIRTEEN_F_POSITION_IDS.object,
    THIRTEEN_F_IMPORT_RUN_IDS.object,
    THIRTEEN_F_IMPORT_ERROR_IDS.object,
  ].map((objectUniversalIdentifier) => ({
      objectUniversalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
});
