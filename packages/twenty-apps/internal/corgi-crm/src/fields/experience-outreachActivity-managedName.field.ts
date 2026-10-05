import { defineField, FieldType, MetadataWritability } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';
export default defineField({
  universalIdentifier: ids.OUTREACHACTIVITY_MANAGEDNAME_ID,
  objectUniversalIdentifier:
    CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'managedName',
  label: 'Automatic activity title',
  icon: 'IconClock',
  isNullable: true,
  defaultValue: null,
  isUIEditable: false,
  writability: MetadataWritability.APPLICATION,
});
