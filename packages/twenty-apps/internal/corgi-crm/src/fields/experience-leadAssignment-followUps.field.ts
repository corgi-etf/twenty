import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { CORGI_CRM_LEAD_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

export default defineField({
  universalIdentifier: ids.LEADASSIGNMENT_FOLLOWUPS_ID,
  objectUniversalIdentifier:
    CORGI_CRM_LEAD_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'followUps',
  label: 'Follow ups',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_ASSIGNMENT_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
