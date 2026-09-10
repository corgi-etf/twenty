import {
  defineView,
  ViewCalendarLayout,
  ViewType,
} from 'twenty-sdk/define';

import {
  COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_CALENDAR_VIEW_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default defineView({
  universalIdentifier: MEETING_BOOKING_CALENDAR_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Meeting Calendar',
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.CALENDAR,
  icon: 'IconCalendarEvent',
  position: 1,
  calendarLayout: ViewCalendarLayout.MONTH,
  calendarFieldMetadataUniversalIdentifier:
    MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: '94297805-11be-4c0c-8836-a657f6ade91a', fieldMetadataUniversalIdentifier: MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '1c6e5bdc-39e6-4951-ab4a-82d9c850edb0', fieldMetadataUniversalIdentifier: COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 200 },
    { universalIdentifier: '2e8e18e8-8e24-4a75-a647-d7a01967a551', fieldMetadataUniversalIdentifier: WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 180 },
  ],
});
