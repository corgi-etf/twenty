import { defineView, ViewType } from 'twenty-sdk/define';

import {
  BOOKED_BY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_RECORD_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER,
  WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default defineView({
  universalIdentifier: MEETING_BOOKING_RECORD_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Meeting Record Fields',
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.FIELDS_WIDGET,
  fields: [
    { universalIdentifier: '0eaec9e1-b289-42c9-bfa8-d2d3632a0a5f', fieldMetadataUniversalIdentifier: MEETING_BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true },
    { universalIdentifier: 'b7670a77-49b5-4da4-ba61-4facf313d75b', fieldMetadataUniversalIdentifier: COMPANY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true },
    { universalIdentifier: '6df1e1f7-8b65-4141-883f-405f3ec1bd72', fieldMetadataUniversalIdentifier: WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true },
    { universalIdentifier: '8341a8ea-ae96-4f60-ad1b-3b62e7b28ddd', fieldMetadataUniversalIdentifier: EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 3, isVisible: true },
    { universalIdentifier: 'b3c2e2c0-a32f-4f52-afc9-998f9cb18777', fieldMetadataUniversalIdentifier: MEETING_BOOKING_SCHEDULED_AT_FIELD_UNIVERSAL_IDENTIFIER, position: 4, isVisible: true },
    { universalIdentifier: 'ab6ada64-724b-4cae-b524-22c9294d2a96', fieldMetadataUniversalIdentifier: MEETING_BOOKING_STATUS_FIELD_UNIVERSAL_IDENTIFIER, position: 5, isVisible: true },
    { universalIdentifier: '1b43d0d8-7da6-47a8-93d3-8ba81fb8888e', fieldMetadataUniversalIdentifier: MEETING_BOOKING_VALIDATION_MESSAGE_FIELD_UNIVERSAL_IDENTIFIER, position: 6, isVisible: true },
    { universalIdentifier: 'de679b07-c241-44cc-aba0-6bda1279e7a2', fieldMetadataUniversalIdentifier: MEETING_BOOKING_BOOKED_AT_FIELD_UNIVERSAL_IDENTIFIER, position: 7, isVisible: true },
    { universalIdentifier: 'aa53504c-ce77-4b5f-be1d-dd2477ff8b0c', fieldMetadataUniversalIdentifier: BOOKED_BY_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 8, isVisible: true },
    { universalIdentifier: 'dc3a0327-036e-4fc7-ab50-ce3b069fa69f', fieldMetadataUniversalIdentifier: MEETING_BOOKING_NOTES_FIELD_UNIVERSAL_IDENTIFIER, position: 9, isVisible: true },
  ],
});
