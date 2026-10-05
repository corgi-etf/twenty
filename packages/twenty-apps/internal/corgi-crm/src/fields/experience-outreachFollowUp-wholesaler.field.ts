import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

export default defineField({
  universalIdentifier: ids.OUTREACHFOLLOWUP_WHOLESALER_ID,
  objectUniversalIdentifier: ids.OUTREACHFOLLOWUP_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'wholesaler',
  label: 'Wholesaler',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: ids.WHOLESALER_FOLLOWUPS_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'wholesalerId',
  },
});
