import {
  defineApplicationRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants';
import {
  CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER,
  CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/role-object-identifiers';
import {
  TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/telegram/telegram-persistence-identifiers';

const permission = (
  objectUniversalIdentifier: string,
  canUpdateObjectRecords: boolean,
) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  canUpdateObjectRecords,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Corgi CRM function role',
  description:
    'Reads CRM identities and outreach context; writes Wholesaler identities, Outreach Activities, and app-owned Telegram delivery records.',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    permission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
        .universalIdentifier,
      false,
    ),
    permission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      false,
    ),
    permission(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      false,
    ),
    permission(CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER, true),
    permission(CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER, true),
    permission(TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER, true),
    permission(TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER, true),
  ],
  fieldPermissions: [],
  permissionFlagUniversalIdentifiers: [],
  rowLevelPermissionPredicateGroups: [],
  rowLevelPermissionPredicates: [],
});
