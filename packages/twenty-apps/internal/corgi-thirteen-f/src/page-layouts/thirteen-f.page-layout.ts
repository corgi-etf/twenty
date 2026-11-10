import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  THIRTEEN_F_PAGE_LAYOUT_ID,
  THIRTEEN_F_PAGE_TAB_ID,
  THIRTEEN_F_PAGE_WIDGET_ID,
  THIRTEEN_F_WORKSPACE_FRONT_COMPONENT_ID,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: THIRTEEN_F_PAGE_LAYOUT_ID,
  name: '13F',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: THIRTEEN_F_PAGE_TAB_ID,
      title: '13F',
      position: 0,
      icon: 'IconChartPie',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: THIRTEEN_F_PAGE_WIDGET_ID,
          title: '13F',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              THIRTEEN_F_WORKSPACE_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
  ],
});
