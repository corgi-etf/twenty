import { defineField, FieldType, MetadataWritability } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';
export default defineField({
  universalIdentifier: ids.MEETINGBOOKING_HELDAT_ID,
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.DATE_TIME,
  name: 'heldAt',
  label: 'Held at',
  icon: 'IconClock',
  isNullable: true,
  defaultValue: null,
});
