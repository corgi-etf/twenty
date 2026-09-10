import { defineIndex } from 'twenty-sdk/define';

import {
  TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_INDEX_UNIVERSAL_IDENTIFIER,
} from 'src/modules/telegram/telegram-persistence-identifiers';

// A request ID is an idempotency key and cannot authorize another generation.
export default defineIndex({
  universalIdentifier:
    TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_INDEX_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  isUnique: true,
  fields: [
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_INDEX_FIELD_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
    },
  ],
});
