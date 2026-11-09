import { defineView } from 'twenty-sdk/define';

import { THIRTEEN_F_MANAGER_IDS } from 'src/constants/universal-identifiers';

const fieldIdentifiers = [
  'b68b81f5-3a95-4121-b26a-e4cb684bb75e',
  '40207b60-e039-474b-90fa-328eadb08724',
  '737de8f1-04cb-4347-84d7-df8cd37f6e20',
  '88de5ac3-7dd7-4aaa-9f39-fa525e77a24a',
  'f0410188-99a0-4b61-bcb7-bbedee02019c',
];

export default defineView({
  universalIdentifier: THIRTEEN_F_MANAGER_IDS.view,
  name: 'All 13F firms',
  objectUniversalIdentifier: THIRTEEN_F_MANAGER_IDS.object,
  icon: 'IconBuildingBank',
  position: 0,
  fields: [
    THIRTEEN_F_MANAGER_IDS.name,
    THIRTEEN_F_MANAGER_IDS.institutionType,
    THIRTEEN_F_MANAGER_IDS.metroArea,
    THIRTEEN_F_MANAGER_IDS.country,
    THIRTEEN_F_MANAGER_IDS.firmAum,
  ].map((fieldMetadataUniversalIdentifier, position) => ({
    universalIdentifier: fieldIdentifiers[position]!,
    fieldMetadataUniversalIdentifier,
    position,
    isVisible: true,
    size: position === 0 ? 280 : 160,
  })),
});
