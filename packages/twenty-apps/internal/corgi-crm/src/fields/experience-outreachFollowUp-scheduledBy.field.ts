import {
  defineField,
  MetadataWritability,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.OUTREACHFOLLOWUP_SCHEDULEDBY_ID,
  objectUniversalIdentifier: ids.OUTREACHFOLLOWUP_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'scheduledBy',
  label: 'Scheduled by',
  icon: 'IconLink',
  isNullable: true,
  isUIEditable: false,
  writability: MetadataWritability.APPLICATION,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.WORKSPACEMEMBER_FOLLOWUPSSCHEDULED_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'scheduledById',
  },
});
