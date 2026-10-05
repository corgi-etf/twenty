import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.OUTREACHFOLLOWUP_CONTACT_ID,
  objectUniversalIdentifier: ids.OUTREACHFOLLOWUP_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'contact',
  label: 'Contact',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: ids.PERSON_FOLLOWUPS_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'contactId',
  },
});
