import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  EXTERNAL_WHOLESALER_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

export default defineField({
  universalIdentifier:
    EXTERNAL_WHOLESALER_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'externalWholesaler',
  label: 'EW',
  description: 'The external wholesaler credited with this allocation',
  icon: 'IconUserStar',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    COMPANY_ALLOCATIONS_ON_WHOLESALER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    // Attribution survives the person's record being removed; the dollars
    // stay, the credit simply goes unassigned.
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'externalWholesalerId',
  },
});
