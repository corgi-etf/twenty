import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.PERSON_FOLLOWUPS_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'followUps',
  label: 'Follow ups',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_CONTACT_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
