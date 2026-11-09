import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  THIRTEEN_F_IMPORT_ERROR_IDS,
  THIRTEEN_F_IMPORT_RUN_IDS,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.object,
  nameSingular: 'thirteenFImportError',
  namePlural: 'thirteenFImportErrors',
  labelSingular: '13F Import Error',
  labelPlural: '13F Import Errors',
  description: 'A rejected source row or unsupported source file reason.',
  icon: 'IconAlertTriangle',
  labelIdentifierFieldMetadataUniversalIdentifier:
    THIRTEEN_F_IMPORT_ERROR_IDS.name,
  fields: [
    {
      universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Error',
      defaultValue: "''",
    },
    ...[
      ['code', 'Code', THIRTEEN_F_IMPORT_ERROR_IDS.code],
      ['message', 'Message', THIRTEEN_F_IMPORT_ERROR_IDS.message],
      [
        'sourceFileName',
        'Source file',
        THIRTEEN_F_IMPORT_ERROR_IDS.sourceFileName,
      ],
      ['sourceSheet', 'Source sheet', THIRTEEN_F_IMPORT_ERROR_IDS.sourceSheet],
      ['rawData', 'Raw source data', THIRTEEN_F_IMPORT_ERROR_IDS.rawData],
    ].map(([name, label, universalIdentifier]) => ({
      universalIdentifier,
      type: FieldType.TEXT as const,
      name,
      label,
      isNullable: true,
    }) as const),
    {
      universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.sourceRow,
      type: FieldType.NUMBER,
      name: 'sourceRow',
      label: 'Source row',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_IMPORT_ERROR_IDS.importRun,
      type: FieldType.RELATION,
      name: 'importRun',
      label: 'Import',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        THIRTEEN_F_IMPORT_RUN_IDS.object,
      relationTargetFieldMetadataUniversalIdentifier:
        THIRTEEN_F_IMPORT_ERROR_IDS.importRunErrors,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'importRunId',
      },
    },
  ],
});
