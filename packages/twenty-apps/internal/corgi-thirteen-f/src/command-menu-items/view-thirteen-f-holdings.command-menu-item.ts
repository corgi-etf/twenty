import {
  defineCommandMenuItem,
  selectedRecords,
  someDefined,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  COMPANY_THIRTEEN_F_FRONT_COMPONENT_ID,
  VIEW_THIRTEEN_F_HOLDINGS_COMMAND_ID,
} from 'src/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: VIEW_THIRTEEN_F_HOLDINGS_COMMAND_ID,
  label: 'View 13F holdings',
  shortLabel: 'View 13F holdings',
  isPinned: true,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  conditionalAvailabilityExpression: someDefined(
    selectedRecords,
    'thirteenFFirmId',
  ),
  frontComponentUniversalIdentifier: COMPANY_THIRTEEN_F_FRONT_COMPONENT_ID,
});
