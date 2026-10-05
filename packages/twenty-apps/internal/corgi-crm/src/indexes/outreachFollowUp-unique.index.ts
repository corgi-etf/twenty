import { defineIndex } from 'twenty-sdk/define';
import * as ids from 'src/modules/experience/experience-identifiers';
export default defineIndex({
  universalIdentifier: '9a543c0b-c04e-5ccb-b93f-fd76102951d7',
  objectUniversalIdentifier: ids.OUTREACHFOLLOWUP_OBJECT_ID,
  isUnique: true,
  fields: [
    {
      universalIdentifier: 'bf79ffe1-fe29-5614-ab35-b6c61fe914f3',
      fieldUniversalIdentifier: ids.FOLLOW_UP_OCCURRENCEKEY_ID,
    },
  ],
});
