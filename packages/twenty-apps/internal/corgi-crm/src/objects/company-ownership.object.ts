import { defineObject, FieldType } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';

export default defineObject({
  universalIdentifier: ids.COMPANYOWNERSHIP_OBJECT_ID,
  nameSingular: 'companyOwnership',
  namePlural: 'companyOwnerships',
  labelSingular: 'Company ownership',
  labelPlural: 'Company ownerships',
  icon: 'IconUsers',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier: ids.COMPANYOWNERSHIP_NAME_ID,
  fields: [
    {
      universalIdentifier: ids.COMPANYOWNERSHIP_NAME_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Company ownership',
      icon: 'IconAbc',
      defaultValue: "''",
    },
    {
      universalIdentifier: ids.COMPANY_OWNERSHIP_PRIMARY_ID,
      type: FieldType.BOOLEAN,
      name: 'isPrimary',
      label: 'Primary owner',
      icon: 'IconUserCheck',
      defaultValue: false,
    },
  ],
});
