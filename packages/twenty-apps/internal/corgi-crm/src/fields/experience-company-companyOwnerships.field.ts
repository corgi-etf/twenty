import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineField({
  universalIdentifier: ids.COMPANY_COMPANYOWNERSHIPS_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'companyOwnerships',
  label: 'Company ownerships',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.COMPANYOWNERSHIP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.COMPANYOWNERSHIP_COMPANY_ID,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
