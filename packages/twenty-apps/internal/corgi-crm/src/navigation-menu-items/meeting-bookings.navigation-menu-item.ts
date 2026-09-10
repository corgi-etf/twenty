import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: '34aec0b7-2007-4d33-a6e5-281117993178',
  position: 3,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier:
    MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
});
