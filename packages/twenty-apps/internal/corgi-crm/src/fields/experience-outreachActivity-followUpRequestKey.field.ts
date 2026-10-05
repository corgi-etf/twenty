import { defineField, FieldType } from 'twenty-sdk/define';
import { CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';
export default defineField({
  universalIdentifier: 'c0e692fa-6e71-5247-9557-d4155b166b96',
  objectUniversalIdentifier:
    CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'followUpRequestKey',
  label: 'Follow-up request',
  icon: 'IconKey',
  isNullable: true,
  defaultValue: null,
});
