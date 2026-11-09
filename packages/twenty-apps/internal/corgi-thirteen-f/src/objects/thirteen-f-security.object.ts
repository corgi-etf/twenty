import { defineObject, FieldType } from 'twenty-sdk/define';

import { THIRTEEN_F_SECURITY_IDS } from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: THIRTEEN_F_SECURITY_IDS.object,
  nameSingular: 'thirteenFSecurity',
  namePlural: 'thirteenFSecurities',
  labelSingular: '13F Security',
  labelPlural: '13F Securities',
  description: 'A security referenced by imported holder data.',
  icon: 'IconChartPie',
  labelIdentifierFieldMetadataUniversalIdentifier:
    THIRTEEN_F_SECURITY_IDS.name,
  fields: [
    {
      universalIdentifier: THIRTEEN_F_SECURITY_IDS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Security',
      defaultValue: "''",
    },
    {
      universalIdentifier: THIRTEEN_F_SECURITY_IDS.ticker,
      type: FieldType.TEXT,
      name: 'ticker',
      label: 'Ticker',
      isNullable: true,
      isUnique: true,
    },
  ],
});
