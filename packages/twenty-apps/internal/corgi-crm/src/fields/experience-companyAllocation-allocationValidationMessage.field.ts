import { defineField, FieldType, MetadataWritability } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/allocation/allocation-identifiers';
export default defineField({
  universalIdentifier: ids.COMPANYALLOCATION_ALLOCATIONVALIDATIONMESSAGE_ID,
  objectUniversalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'allocationValidationMessage',
  label: 'Allocation check',
  icon: 'IconClock',
  isNullable: true,
  defaultValue: null,
  isUIEditable: false,
  writability: MetadataWritability.APPLICATION,
});
