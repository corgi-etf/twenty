import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_RUN_IDS,
} from 'src/constants/universal-identifiers';

const countField = (
  universalIdentifier: string,
  name: string,
  label: string,
) => ({
  universalIdentifier,
  type: FieldType.NUMBER as const,
  name,
  label,
  isNullable: false,
  defaultValue: 0,
}) as const;

export default defineObject({
  universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.object,
  nameSingular: 'thirteenFImportRun',
  namePlural: 'thirteenFImportRuns',
  labelSingular: '13F Import',
  labelPlural: '13F Imports',
  description: 'Auditable result of parsing one source document version.',
  icon: 'IconFileImport',
  labelIdentifierFieldMetadataUniversalIdentifier:
    THIRTEEN_F_IMPORT_RUN_IDS.name,
  fields: [
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Import',
      defaultValue: "''",
    },
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.importKey,
      type: FieldType.TEXT,
      name: 'importKey',
      label: 'Import key',
      isNullable: true,
      isUnique: true,
    },
    ...[
      ['sourceNodeId', 'Source node ID', THIRTEEN_F_IMPORT_RUN_IDS.sourceNodeId],
      [
        'sourceVersionId',
        'Source version ID',
        THIRTEEN_F_IMPORT_RUN_IDS.sourceVersionId,
      ],
      [
        'contentSha256',
        'Content SHA-256',
        THIRTEEN_F_IMPORT_RUN_IDS.contentSha256,
      ],
      [
        'parserVersion',
        'Parser version',
        THIRTEEN_F_IMPORT_RUN_IDS.parserVersion,
      ],
      [
        'sourceFileName',
        'Source file',
        THIRTEEN_F_IMPORT_RUN_IDS.sourceFileName,
      ],
    ].map(([name, label, universalIdentifier]) => ({
      universalIdentifier,
      type: FieldType.TEXT as const,
      name,
      label,
      isNullable: true,
    }) as const),
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.status,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      isNullable: false,
      defaultValue: "'PLANNED'",
      options: ([
        ['PLANNED', 'Planned', 'gray', '2f01bc52-c76f-4db1-97e0-dd0b35c74cec'],
        ['STAGING', 'Staging', 'blue', '630b007f-bbf7-400a-b4df-16c58165d57e'],
        ['COMPLETE', 'Complete', 'green', 'd50cb46a-13a5-449f-848d-9e58c2b7817e'],
        ['PARTIAL', 'Partial', 'orange', 'f449f7a3-085e-4db0-8a18-c6f6d7f0a4dd'],
        ['REJECTED', 'Rejected', 'red', 'baad0cd7-9e9c-445a-92f0-6ccc4bd0a8aa'],
        ['UNSUPPORTED', 'Unsupported', 'gray', '016dea4a-47e5-438e-89b8-2626142979ce'],
        ['NO_OP', 'No changes', 'purple', '7ef64bf5-846b-4fd1-9d5a-18eb3b7e1576'],
      ] as const).map(([value, label, color, id], position) => ({
        id,
        value,
        label,
        color,
        position,
      })),
    },
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.acceptedCount,
      'acceptedCount',
      'Accepted rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.rejectedCount,
      'rejectedCount',
      'Rejected rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.ignoredCount,
      'ignoredCount',
      'Ignored rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.insertedCount,
      'insertedCount',
      'Inserted rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.updatedCount,
      'updatedCount',
      'Updated rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.unchangedCount,
      'unchangedCount',
      'Unchanged rows',
    ),
    countField(
      THIRTEEN_F_IMPORT_RUN_IDS.supersededCount,
      'supersededCount',
      'Superseded rows',
    ),
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.errorSummary,
      type: FieldType.TEXT,
      name: 'errorSummary',
      label: 'Error summary',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.startedAt,
      type: FieldType.DATE_TIME,
      name: 'startedAt',
      label: 'Started at',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.completedAt,
      type: FieldType.DATE_TIME,
      name: 'completedAt',
      label: 'Completed at',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.filing,
      type: FieldType.RELATION,
      name: 'filing',
      label: 'Source filing',
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        THIRTEEN_F_IMPORT_RUN_IDS.filingImportRuns,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'filingId',
      },
    },
  ],
});
