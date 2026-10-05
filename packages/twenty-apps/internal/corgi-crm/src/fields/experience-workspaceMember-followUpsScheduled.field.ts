import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.WORKSPACEMEMBER_FOLLOWUPSSCHEDULED_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'followUpsScheduled',
  label: 'Follow ups scheduled',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.OUTREACHFOLLOWUP_SCHEDULEDBY_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
