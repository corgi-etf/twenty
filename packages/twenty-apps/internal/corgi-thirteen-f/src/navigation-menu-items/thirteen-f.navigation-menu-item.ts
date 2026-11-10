import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  THIRTEEN_F_NAVIGATION_ID,
  THIRTEEN_F_PAGE_LAYOUT_ID,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: THIRTEEN_F_NAVIGATION_ID,
  name: '13F',
  icon: 'IconChartPie',
  position: 4,
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutUniversalIdentifier: THIRTEEN_F_PAGE_LAYOUT_ID,
});
