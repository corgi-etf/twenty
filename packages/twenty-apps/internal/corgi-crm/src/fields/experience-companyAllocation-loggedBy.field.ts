import {
  defineField,
  MetadataWritability,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/allocation/allocation-identifiers';

export default defineField({
  universalIdentifier: ids.COMPANYALLOCATION_LOGGEDBY_ID,
  objectUniversalIdentifier: COMPANY_ALLOCATION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'loggedBy',
  label: 'Logged by',
  icon: 'IconLink',
  isNullable: true,
  isUIEditable: false,
  writability: MetadataWritability.APPLICATION,
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.WORKSPACEMEMBER_ALLOCATIONSLOGGED_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'loggedById',
  },
});
