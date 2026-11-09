import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { THIRTEEN_F_MANAGER_IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: THIRTEEN_F_MANAGER_IDS.navigation,
  name: '13F Firms',
  icon: 'IconBuildingBank',
  color: 'blue',
  position: 1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: THIRTEEN_F_MANAGER_IDS.view,
});
