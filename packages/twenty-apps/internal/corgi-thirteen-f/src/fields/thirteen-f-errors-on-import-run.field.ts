import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  THIRTEEN_F_IMPORT_ERROR_IDS,
  THIRTEEN_F_IMPORT_RUN_IDS,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.importRunErrors,
  objectUniversalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.object,
  type: FieldType.RELATION,
  name: 'errors',
  label: 'Errors',
  relationTargetObjectMetadataUniversalIdentifier:
    THIRTEEN_F_IMPORT_ERROR_IDS.object,
  relationTargetFieldMetadataUniversalIdentifier:
    THIRTEEN_F_IMPORT_ERROR_IDS.importRun,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
