import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import { THIRTEEN_F_IMPORT_RUN_IDS } from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.navigation,
  name: '13F Imports',
  icon: 'IconFileImport',
  color: 'blue',
  position: 3,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: THIRTEEN_F_IMPORT_RUN_IDS.view,
});
