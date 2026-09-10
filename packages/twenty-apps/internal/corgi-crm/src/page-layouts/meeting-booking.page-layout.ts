import {
  definePageLayout,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import {
  MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_RECORD_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  MEETING_BOOKING_RECORD_PAGE_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';

export default definePageLayout({
  universalIdentifier: MEETING_BOOKING_RECORD_PAGE_UNIVERSAL_IDENTIFIER,
  name: 'Meeting Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: MEETING_BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: '905e6786-16ef-4590-94df-f6b70b68fd73',
      title: 'Meeting',
      position: 10,
      icon: 'IconCalendarEvent',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: '4dfa9406-98cb-446c-a37f-a5061a1464fb',
          title: 'Meeting details',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier:
              MEETING_BOOKING_RECORD_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
          },
        },
      ],
    },
    {
      universalIdentifier: 'bfb2f5da-2ae1-42b2-8038-58223dde31df',
      title: 'Timeline',
      position: 20,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: '65f0aa12-a4f7-48f3-b196-f3149615ffcd',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: { configurationType: 'TIMELINE' },
        },
      ],
    },
  ],
});
