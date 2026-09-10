import { defineIndex } from 'twenty-sdk/define';

import {
  TELEGRAM_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_KEY_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_KEY_INDEX_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/telegram/telegram-persistence-identifiers';

export default defineIndex({
  universalIdentifier: TELEGRAM_DELIVERY_KEY_INDEX_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER,
  isUnique: true,
  fields: [
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_KEY_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier:
        TELEGRAM_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
    },
  ],
});
