import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKINGS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default defineField({
  universalIdentifier:
    MEETING_BOOKINGS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'meetingBookings',
  label: 'Meetings',
  icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
