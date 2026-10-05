import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.WORKSPACEMEMBER_FOLLOWUPSASSIGNED_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'followUpsAssigned',
  label: 'Follow ups assigned',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_ASSIGNEE_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
