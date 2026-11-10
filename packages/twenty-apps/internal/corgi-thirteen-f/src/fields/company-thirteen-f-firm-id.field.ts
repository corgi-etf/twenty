import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { THIRTEEN_F_COMPANY_FIRM_ID_FIELD_ID } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: THIRTEEN_F_COMPANY_FIRM_ID_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.TEXT,
  name: 'thirteenFFirmId',
  label: '13F firm link',
  description:
    'Read-only projection of the linked 13F firm ID. The website remains the source of truth.',
  icon: 'IconChartPie',
  isNullable: true,
  isUIEditable: false,
  isUnique: true,
});
