import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { THIRTEEN_F_POSITION_IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: THIRTEEN_F_POSITION_IDS.navigation,
  name: '13F Holdings',
  icon: 'IconTable',
  color: 'blue',
  position: 0,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: THIRTEEN_F_POSITION_IDS.view,
});
