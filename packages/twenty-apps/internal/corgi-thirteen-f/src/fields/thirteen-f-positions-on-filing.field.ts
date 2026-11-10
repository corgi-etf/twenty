import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_POSITION_IDS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: THIRTEEN_F_POSITION_IDS.filingPositions,
  objectUniversalIdentifier: THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'positions',
  label: 'Holdings',
  relationTargetObjectMetadataUniversalIdentifier:
    THIRTEEN_F_POSITION_IDS.object,
  relationTargetFieldMetadataUniversalIdentifier:
    THIRTEEN_F_POSITION_IDS.filing,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
