import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  EXTERNAL_WHOLESALER_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

// The counterpart of `externalWholesaler` on the allocation; see the meeting
// counterpart for why both sides have to be declared.
export default defineField({
  universalIdentifier:
    COMPANY_ALLOCATIONS_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'creditedAllocations',
  label: 'Credited Allocations',
  description: 'Allocations this external wholesaler is credited with',
  icon: 'IconChartPie',
  relationTargetObjectMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    EXTERNAL_WHOLESALER_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
