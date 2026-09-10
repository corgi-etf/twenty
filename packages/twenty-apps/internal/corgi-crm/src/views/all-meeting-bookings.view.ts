import { defineView, ViewType } from 'twenty-sdk/define';

import {
  BOOKED_BY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_ALL_VIEW_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default defineView({
  universalIdentifier: MEETING_BOOKING_ALL_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'All Meetings',
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconCalendarEvent',
  position: 0,
  fields: [
    { universalIdentifier: '38965c11-b44e-4895-a164-1a7d10cf6acf', fieldMetadataUniversalIdentifier: MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: 'a8b683f2-9170-470d-89a4-286c26f189df', fieldMetadataUniversalIdentifier: COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 200 },
    { universalIdentifier: 'f65e3f7f-6d1e-4171-a0b4-20d903192803', fieldMetadataUniversalIdentifier: WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 180 },
    { universalIdentifier: 'c076e161-ced4-46a7-8896-a1e720d0f662', fieldMetadataUniversalIdentifier: EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 3, isVisible: true, size: 180 },
    { universalIdentifier: 'cd6586ff-a212-4090-a053-394efcb42981', fieldMetadataUniversalIdentifier: MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER, position: 4, isVisible: true, size: 180 },
    { universalIdentifier: '505124bc-6c4d-47c3-a59e-ce53fd3b9f30', fieldMetadataUniversalIdentifier: MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: '64222f5e-3b2c-4e5d-b35a-25b0a5285835', fieldMetadataUniversalIdentifier: MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER, position: 6, isVisible: true, size: 180 },
    { universalIdentifier: 'f0032b31-c785-4c91-bed6-73670135571a', fieldMetadataUniversalIdentifier: BOOKED_BY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 7, isVisible: true, size: 180 },
    { universalIdentifier: 'a5741ee6-3566-493a-b7b4-01bfb59510dc', fieldMetadataUniversalIdentifier: MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER, position: 8, isVisible: true, size: 260 },
  ],
});
