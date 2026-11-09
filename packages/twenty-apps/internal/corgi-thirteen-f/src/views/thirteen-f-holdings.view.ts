import { ViewFilterOperand, defineView } from 'twenty-sdk/define';

import { THIRTEEN_F_POSITION_IDS } from 'src/constants/universal-identifiers';

const fieldIdentifiers = [
  '8272ef8e-166b-4898-a420-1cb9e01d2c55',
  '3e624603-1437-44c6-b776-304b1471dc52',
  '715f481a-5d1c-4e77-b9da-1a457f00149c',
  'badf2a89-a52a-4684-b3f7-0a3fb18a9981',
  '8baa1d2c-a171-45a4-87a0-c3b9ec9ff596',
  '0965b9df-6ccf-42ed-8824-f50a475128e8',
  'e345f81d-07f3-4237-9dfd-f6707ba40578',
];

export default defineView({
  universalIdentifier: THIRTEEN_F_POSITION_IDS.view,
  name: 'All 13F holdings',
  objectUniversalIdentifier: THIRTEEN_F_POSITION_IDS.object,
  icon: 'IconTable',
  position: 0,
  fields: [
    THIRTEEN_F_POSITION_IDS.managerName,
    THIRTEEN_F_POSITION_IDS.securityTicker,
    THIRTEEN_F_POSITION_IDS.sharesHeld,
    THIRTEEN_F_POSITION_IDS.portfolioPercent,
    THIRTEEN_F_POSITION_IDS.asOfDate,
    THIRTEEN_F_POSITION_IDS.sourceType,
    THIRTEEN_F_POSITION_IDS.targetTicker,
  ].map((fieldMetadataUniversalIdentifier, position) => ({
    universalIdentifier: fieldIdentifiers[position]!,
    fieldMetadataUniversalIdentifier,
    position,
    isVisible: true,
    size: position === 0 ? 260 : 140,
  })),
  filters: [
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.activeViewFilter,
      fieldMetadataUniversalIdentifier: THIRTEEN_F_POSITION_IDS.isActive,
      operand: ViewFilterOperand.IS,
      value: true,
    },
  ],
});
