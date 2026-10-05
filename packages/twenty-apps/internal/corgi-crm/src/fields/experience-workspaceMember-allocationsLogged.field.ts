import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/allocation/allocation-identifiers';

export default defineField({
  universalIdentifier: ids.WORKSPACEMEMBER_ALLOCATIONSLOGGED_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'allocationsLogged',
  label: 'Allocations logged',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.COMPANYALLOCATION_LOGGEDBY_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
