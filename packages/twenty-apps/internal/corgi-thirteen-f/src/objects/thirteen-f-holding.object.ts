import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_IMPORT_RUN_IDS,
  THIRTEEN_F_MANAGER_IDS,
  THIRTEEN_F_POSITION_IDS,
  THIRTEEN_F_SECURITY_IDS,
} from 'src/constants/universal-identifiers';

const nullableText = (
  universalIdentifier: string,
  name: string,
  label: string,
) => ({
  universalIdentifier,
  type: FieldType.TEXT as const,
  name,
  label,
  isNullable: true,
}) as const;

const relation = (
  universalIdentifier: string,
  name: string,
  label: string,
  targetObject: string,
  targetField: string,
  joinColumnName: string,
) => ({
  universalIdentifier,
  type: FieldType.RELATION as const,
  name,
  label,
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: targetObject,
  relationTargetFieldMetadataUniversalIdentifier: targetField,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName,
  },
}) as const;

export default defineObject({
  universalIdentifier: THIRTEEN_F_POSITION_IDS.object,
  nameSingular: 'thirteenFHolding',
  namePlural: 'thirteenFHoldings',
  labelSingular: '13F Holding',
  labelPlural: '13F Holdings',
  description: 'A normalized manager holding from an imported source workbook.',
  icon: 'IconTable',
  labelIdentifierFieldMetadataUniversalIdentifier:
    THIRTEEN_F_POSITION_IDS.name,
  fields: [
    {
      ...nullableText(THIRTEEN_F_POSITION_IDS.name, 'name', 'Holding'),
      defaultValue: "''",
    },
    {
      ...nullableText(
        THIRTEEN_F_POSITION_IDS.positionKey,
        'positionKey',
        'Position key',
      ),
      isNullable: true,
    },
    {
      ...nullableText(
        THIRTEEN_F_POSITION_IDS.occurrenceKey,
        'occurrenceKey',
        'Source occurrence key',
      ),
      isNullable: true,
      isUnique: true,
    },
    relation(
      THIRTEEN_F_POSITION_IDS.manager,
      'manager',
      'Firm',
      THIRTEEN_F_MANAGER_IDS.object,
      THIRTEEN_F_MANAGER_IDS.positions,
      'managerId',
    ),
    relation(
      THIRTEEN_F_POSITION_IDS.security,
      'security',
      'Security',
      THIRTEEN_F_SECURITY_IDS.object,
      THIRTEEN_F_SECURITY_IDS.positions,
      'securityId',
    ),
    relation(
      THIRTEEN_F_POSITION_IDS.importRun,
      'importRun',
      'Import',
      THIRTEEN_F_IMPORT_RUN_IDS.object,
      THIRTEEN_F_IMPORT_RUN_IDS.positions,
      'importRunId',
    ),
    relation(
      THIRTEEN_F_POSITION_IDS.filing,
      'filing',
      'Source filing',
      THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
      THIRTEEN_F_POSITION_IDS.filingPositions,
      'filingId',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.managerName,
      'managerName',
      'Firm',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.portfolioName,
      'portfolioName',
      'Portfolio',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.targetTicker,
      'targetTicker',
      'Corgi ticker',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.securityTicker,
      'securityTicker',
      'Held ticker',
    ),
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.sharesHeld,
      type: FieldType.NUMBER,
      name: 'sharesHeld',
      label: 'Position',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.latestChange,
      type: FieldType.NUMBER,
      name: 'latestChange',
      label: 'Latest change',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.asOfDate,
      type: FieldType.DATE,
      name: 'asOfDate',
      label: 'Filing date',
      isNullable: true,
    },
    nullableText(
      THIRTEEN_F_POSITION_IDS.sourceType,
      'sourceType',
      'Source type',
    ),
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.ownershipPercent,
      type: FieldType.NUMBER,
      name: 'ownershipPercent',
      label: '% outstanding',
      isNullable: true,
    },
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.portfolioPercent,
      type: FieldType.NUMBER,
      name: 'portfolioPercent',
      label: '% portfolio',
      isNullable: true,
    },
    nullableText(
      THIRTEEN_F_POSITION_IDS.insiderStatus,
      'insiderStatus',
      'Insider status',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.institutionType,
      'institutionType',
      'Institution type',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.metroArea,
      'metroArea',
      'Metro area',
    ),
    nullableText(THIRTEEN_F_POSITION_IDS.country, 'country', 'Country'),
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.isActive,
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Active version',
      isNullable: false,
      defaultValue: false,
    },
    nullableText(
      THIRTEEN_F_POSITION_IDS.sourceSheet,
      'sourceSheet',
      'Source sheet',
    ),
    {
      universalIdentifier: THIRTEEN_F_POSITION_IDS.sourceRow,
      type: FieldType.NUMBER,
      name: 'sourceRow',
      label: 'Source row',
      isNullable: true,
    },
    nullableText(
      THIRTEEN_F_POSITION_IDS.rowDigest,
      'rowDigest',
      'Row digest',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.rawData,
      'rawData',
      'Raw source data',
    ),
    nullableText(
      THIRTEEN_F_POSITION_IDS.searchText,
      'searchText',
      'Search text',
    ),
  ],
});
