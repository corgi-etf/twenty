import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  THIRTEEN_F_FILING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_MANAGER_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_REPORT_PERIOD_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_DRIVE_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_LINK_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_NODE_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_SOURCE_VERSION_ID_FIELD_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILING_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: THIRTEEN_F_FILING_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'thirteenFFiling',
  namePlural: 'thirteenFFilings',
  labelSingular: '13F Filing',
  labelPlural: '13F Filings',
  description: 'A 13F filing document available to the sales team.',
  icon: 'IconFiles',
  labelIdentifierFieldMetadataUniversalIdentifier:
    THIRTEEN_F_FILING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier:
        THIRTEEN_F_FILING_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'Original document name or filing label.',
      icon: 'IconAbc',
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_TICKER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'ticker',
      label: 'Ticker',
      description: 'Related fund ticker when known.',
      icon: 'IconTag',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_MANAGER_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'managerName',
      label: 'Manager',
      description: 'Investment manager associated with the filing.',
      icon: 'IconBuildingBank',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_REPORT_PERIOD_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE,
      name: 'reportPeriod',
      label: 'Report period',
      description: 'Quarter-end date covered by the filing.',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.FILES,
      name: 'file',
      label: 'File',
      description: 'The filing or holder workbook available for viewing.',
      icon: 'IconPaperclip',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 1 },
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_DRIVE_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'sourceDriveId',
      label: 'Source drive ID',
      description: 'Corgi Drive identifier retained for import provenance.',
      icon: 'IconDatabase',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_NODE_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'sourceNodeId',
      label: 'Source node ID',
      description: 'Stable source file identifier used for idempotent imports.',
      icon: 'IconFingerprint',
      isNullable: true,
      isUnique: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_VERSION_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'sourceVersionId',
      label: 'Source version ID',
      description: 'Source file version copied into the CRM.',
      icon: 'IconVersions',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_UPDATED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'sourceUpdatedAt',
      label: 'Source updated at',
      description: 'Last-modified timestamp observed during import.',
      icon: 'IconClock',
      isNullable: true,
    },
    {
      universalIdentifier:
        THIRTEEN_F_FILING_SOURCE_LINK_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.LINKS,
      name: 'sourceLink',
      label: 'Source link',
      description: 'Restricted link back to the original Corgi Drive folder.',
      icon: 'IconExternalLink',
      isNullable: true,
    },
  ],
});
