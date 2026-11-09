import { defineObject, FieldType } from 'twenty-sdk/define';

import { THIRTEEN_F_MANAGER_IDS } from 'src/constants/universal-identifiers';

const textField = (
  universalIdentifier: string,
  name: string,
  label: string,
) => ({
  universalIdentifier,
  type: FieldType.TEXT as const,
  name,
  label,
  isNullable: true,
}) as const;

export default defineObject({
  universalIdentifier: THIRTEEN_F_MANAGER_IDS.object,
  nameSingular: 'thirteenFManager',
  namePlural: 'thirteenFManagers',
  labelSingular: '13F Firm',
  labelPlural: '13F Firms',
  description: 'An investment manager observed in imported holder data.',
  icon: 'IconBuildingBank',
  labelIdentifierFieldMetadataUniversalIdentifier: THIRTEEN_F_MANAGER_IDS.name,
  fields: [
    {
      ...textField(THIRTEEN_F_MANAGER_IDS.name, 'name', 'Firm'),
      defaultValue: "''",
    },
    {
      ...textField(
        THIRTEEN_F_MANAGER_IDS.normalizedName,
        'normalizedName',
        'Normalized name',
      ),
      isNullable: true,
      isUnique: true,
    },
    textField(THIRTEEN_F_MANAGER_IDS.searchText, 'searchText', 'Search text'),
    textField(
      THIRTEEN_F_MANAGER_IDS.institutionType,
      'institutionType',
      'Institution type',
    ),
    textField(THIRTEEN_F_MANAGER_IDS.metroArea, 'metroArea', 'Metro area'),
    textField(THIRTEEN_F_MANAGER_IDS.country, 'country', 'Country'),
    textField(
      THIRTEEN_F_MANAGER_IDS.managingDirector,
      'managingDirector',
      'Managing director / partner',
    ),
    textField(
      THIRTEEN_F_MANAGER_IDS.chiefInvestmentOfficer,
      'chiefInvestmentOfficer',
      'Chief investment officer',
    ),
    textField(
      THIRTEEN_F_MANAGER_IDS.managingDirectorPhone,
      'managingDirectorPhone',
      'Managing director phone',
    ),
    textField(
      THIRTEEN_F_MANAGER_IDS.chiefInvestmentOfficerPhone,
      'chiefInvestmentOfficerPhone',
      'Chief investment officer phone',
    ),
    textField(
      THIRTEEN_F_MANAGER_IDS.managingDirectorEmail,
      'managingDirectorEmail',
      'Managing director email',
    ),
    textField(
      THIRTEEN_F_MANAGER_IDS.chiefInvestmentOfficerEmail,
      'chiefInvestmentOfficerEmail',
      'Chief investment officer email',
    ),
    {
      universalIdentifier: THIRTEEN_F_MANAGER_IDS.firmAum,
      type: FieldType.NUMBER,
      name: 'firmAum',
      label: 'Firm AUM',
      isNullable: true,
    },
    textField(THIRTEEN_F_MANAGER_IDS.website, 'website', 'Website'),
    textField(THIRTEEN_F_MANAGER_IDS.mainPhone, 'mainPhone', 'Main phone'),
    textField(
      THIRTEEN_F_MANAGER_IDS.generalEmail,
      'generalEmail',
      'General email',
    ),
    textField(THIRTEEN_F_MANAGER_IDS.notes, 'notes', 'Notes'),
    textField(
      THIRTEEN_F_MANAGER_IDS.enrichmentSource,
      'enrichmentSource',
      'Enrichment source',
    ),
  ],
});
