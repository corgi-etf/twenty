import { defineView } from 'twenty-sdk/define';

import { THIRTEEN_F_IMPORT_RUN_IDS } from 'src/constants/universal-identifiers';

const fieldIdentifiers = [
  '863778fb-d78f-470f-860f-fe38843013ae',
  '46ef8f6b-dd79-4891-8e00-e5d8b7ca1586',
  'f559373c-ad21-4bc7-85ff-4954ed7e7a92',
  '067c0e27-13b1-4430-a5c7-4d107151dad4',
  'a9a1d128-2c53-487d-904b-4d8a71a0b5c9',
  'c7e53415-b405-467d-aa06-378b4cfd70d4',
];

export default defineView({
  universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.view,
  name: 'All 13F imports',
  objectUniversalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.object,
  icon: 'IconFileImport',
  position: 0,
  fields: [
    THIRTEEN_F_IMPORT_RUN_IDS.name,
    THIRTEEN_F_IMPORT_RUN_IDS.status,
    THIRTEEN_F_IMPORT_RUN_IDS.acceptedCount,
    THIRTEEN_F_IMPORT_RUN_IDS.rejectedCount,
    THIRTEEN_F_IMPORT_RUN_IDS.sourceFileName,
    THIRTEEN_F_IMPORT_RUN_IDS.completedAt,
  ].map((fieldMetadataUniversalIdentifier, position) => ({
    universalIdentifier: fieldIdentifiers[position]!,
    fieldMetadataUniversalIdentifier,
    position,
    isVisible: true,
    size: position === 0 ? 280 : 150,
  })),
});
