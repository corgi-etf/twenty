import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  THIRTEEN_F_MANAGER_IDS,
  THIRTEEN_F_POSITION_IDS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: THIRTEEN_F_MANAGER_IDS.positions,
  objectUniversalIdentifier: THIRTEEN_F_MANAGER_IDS.object,
  type: FieldType.RELATION,
  name: 'positions',
  label: 'Holdings',
  relationTargetObjectMetadataUniversalIdentifier:
    THIRTEEN_F_POSITION_IDS.object,
  relationTargetFieldMetadataUniversalIdentifier:
    THIRTEEN_F_POSITION_IDS.manager,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
