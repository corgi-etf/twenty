import { defineField, FieldType, MetadataWritability } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';
export default defineField({
  universalIdentifier: ids.MEETINGBOOKING_HELDRECORDEDAT_ID,
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.DATE_TIME,
  name: 'heldRecordedAt',
  label: 'Completion recorded at',
  icon: 'IconClock',
  isNullable: true,
  defaultValue: null,
  isUIEditable: false,
  writability: MetadataWritability.APPLICATION,
});
