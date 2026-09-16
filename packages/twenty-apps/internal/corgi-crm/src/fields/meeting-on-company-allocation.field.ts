import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_MEETING_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';

export default defineField({
  universalIdentifier: MEETING_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'meeting',
  label: 'Meeting',
  description: 'The meeting that led to this allocation',
  icon: 'IconCalendarEvent',
  // Nullable because an allocation can be recorded before anyone links the
  // meeting it came from, and some allocations never had one.
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    COMPANY_ALLOCATIONS_ON_MEETING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    // Unlike the company link, the allocation outlives the meeting record:
    // deleting a meeting must not erase the dollars it produced.
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'meetingId',
  },
});
