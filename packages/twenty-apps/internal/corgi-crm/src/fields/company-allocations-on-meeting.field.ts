import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_MEETING_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';

// The counterpart of `meeting` on the allocation. A relation needs both sides
// declared: without this the allocation side fails to sync with
// FIELD_METADATA_NOT_FOUND, because its target does not exist yet.
export default defineField({
  universalIdentifier:
    COMPANY_ALLOCATIONS_ON_MEETING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'allocations',
  label: 'Allocations',
  description: 'Allocations this meeting led to',
  icon: 'IconChartPie',
  relationTargetObjectMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    MEETING_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
