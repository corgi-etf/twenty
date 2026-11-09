import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  THIRTEEN_F_FILINGS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  THIRTEEN_F_FILINGS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    THIRTEEN_F_FILINGS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: '13F Filings',
  icon: 'IconFiles',
  color: 'blue',
  position: 4,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: THIRTEEN_F_FILINGS_VIEW_UNIVERSAL_IDENTIFIER,
});
