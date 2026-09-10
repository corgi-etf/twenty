import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKINGS_ATTRIBUTED_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

// Whoever books the meeting picks this, so it stays UI editable and workspace
// writable, unlike the application-owned booking evidence on the same record.
export default defineField({
  universalIdentifier:
    EXTERNAL_WHOLESALER_ON_MEETING_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'externalWholesaler',
  label: 'EW / external wholesaler',
  icon: 'IconUserShare',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    MEETING_BOOKINGS_ATTRIBUTED_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'externalWholesalerId',
  },
});
