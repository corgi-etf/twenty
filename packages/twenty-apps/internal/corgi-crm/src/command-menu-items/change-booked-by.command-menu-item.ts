import { defineCommandMenuItem } from 'twenty-sdk/define';

import {
  CHANGE_BOOKED_BY_COMMAND_UNIVERSAL_IDENTIFIER,
  CHANGE_BOOKED_BY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: CHANGE_BOOKED_BY_COMMAND_UNIVERSAL_IDENTIFIER,
  label: 'Change booked by',
  shortLabel: 'Booked by',
  isPinned: false,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  frontComponentUniversalIdentifier:
    CHANGE_BOOKED_BY_FORM_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
