import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/allocation/allocation-identifiers';

export default defineField({
  universalIdentifier: ids.PERSON_COMPANYALLOCATIONS_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'companyAllocations',
  label: 'Company allocations',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.COMPANYALLOCATION_CONTACT_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
