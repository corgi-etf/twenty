import { defineView } from 'twenty-sdk/define';

import { THIRTEEN_F_SECURITY_IDS } from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: THIRTEEN_F_SECURITY_IDS.view,
  name: 'All 13F securities',
  objectUniversalIdentifier: THIRTEEN_F_SECURITY_IDS.object,
  icon: 'IconChartPie',
  position: 0,
  fields: [
    {
      universalIdentifier: '76a6a731-2c7e-4889-a97e-c69360f4ed0b',
      fieldMetadataUniversalIdentifier: THIRTEEN_F_SECURITY_IDS.name,
      position: 0,
      isVisible: true,
      size: 280,
    },
    {
      universalIdentifier: '36ddfe01-cab3-4cb6-85ca-3467454ea080',
      fieldMetadataUniversalIdentifier: THIRTEEN_F_SECURITY_IDS.ticker,
      position: 1,
      isVisible: true,
      size: 160,
    },
  ],
});
