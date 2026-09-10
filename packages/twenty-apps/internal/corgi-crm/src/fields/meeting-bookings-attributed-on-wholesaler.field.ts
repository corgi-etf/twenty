import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKINGS_ATTRIBUTED_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

export default defineField({
  universalIdentifier:
    MEETING_BOOKINGS_ATTRIBUTED_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'attributedMeetings',
  label: 'Meetings as EW',
  icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
