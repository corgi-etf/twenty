import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  COMPANY_ALLOCATIONS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  COMPANY_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/allocation/allocation-identifiers';

export default defineField({
  universalIdentifier:
    COMPANY_ON_COMPANY_ALLOCATION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'company',
  label: 'RIA / company',
  icon: 'IconBuildingSkyscraper',
  // Nullable so a row can be created from the table before its company is
  // picked; the Allocations section on a company fills it in immediately.
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    COMPANY_ALLOCATIONS_ON_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    // An allocation has no meaning without its company, so destroying the
    // company destroys them rather than leaving unattributable dollar amounts.
    onDelete: OnDeleteAction.CASCADE,
    joinColumnName: 'companyId',
  },
});
