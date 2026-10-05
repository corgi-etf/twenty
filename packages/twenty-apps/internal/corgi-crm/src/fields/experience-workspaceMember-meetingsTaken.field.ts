import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';

export default defineField({
  universalIdentifier: ids.WORKSPACEMEMBER_MEETINGSTAKEN_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'meetingsTaken',
  label: 'Meetings taken',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: ids.MEETINGBOOKING_TAKENBY_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
