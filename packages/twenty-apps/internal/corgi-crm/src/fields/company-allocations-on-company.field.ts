import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  COMPANY_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';

// This label is the section heading on every company record.
export default defineField({
  universalIdentifier:
    COMPANY_ALLOCATIONS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'allocations',
  label: 'Allocations',
  description: 'Dollar amounts this company allocates, one row per ticker',
  icon: 'IconChartPie',
  relationTargetObjectMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    COMPANY_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
