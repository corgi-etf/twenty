import {
  defineCommandMenuItem,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LOG_ACTIVITY_COMMAND_UNIVERSAL_IDENTIFIER,
  LOG_ACTIVITY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants';

export default defineCommandMenuItem({
  universalIdentifier: LOG_ACTIVITY_COMMAND_UNIVERSAL_IDENTIFIER,
  label: 'Log activity',
  shortLabel: 'Log activity',
  isPinned: true,
  // Scoped to the company in context so the form never has to ask which one.
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  frontComponentUniversalIdentifier:
    LOG_ACTIVITY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
