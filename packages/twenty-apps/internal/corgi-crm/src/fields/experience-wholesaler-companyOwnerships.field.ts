import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
import { CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/role-object-identifiers';

export default defineField({
  universalIdentifier: ids.WHOLESALER_COMPANYOWNERSHIPS_ID,
  objectUniversalIdentifier: CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'companyOwnerships',
  label: 'Company ownerships',
  icon: 'IconLink',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    ids.COMPANYOWNERSHIP_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    ids.COMPANYOWNERSHIP_WHOLESALER_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    junctionTargetFieldUniversalIdentifier: ids.COMPANYOWNERSHIP_COMPANY_ID,
  },
});
