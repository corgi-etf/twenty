import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { THIRTEEN_F_SECURITY_IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: THIRTEEN_F_SECURITY_IDS.navigation,
  name: '13F Securities',
  icon: 'IconChartPie',
  color: 'blue',
  position: 2,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: THIRTEEN_F_SECURITY_IDS.view,
});
