import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  TELEGRAM_DELIVERY_AUDIT_ACTOR_WORKSPACE_MEMBER_ID_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_EXPECTED_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REASON_DIGEST_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REQUESTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/telegram/telegram-persistence-identifiers';

export default defineObject({
  universalIdentifier: TELEGRAM_DELIVERY_AUDIT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'telegramDeliveryAudit',
  namePlural: 'telegramDeliveryAudits',
  labelSingular: 'Telegram delivery audit',
  labelPlural: 'Telegram delivery audits',
  description:
    'Append-only operator authorization record for a Telegram delivery reset',
  icon: 'IconHistory',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    TELEGRAM_DELIVERY_AUDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'requestId',
      label: 'Request ID',
      icon: 'IconId',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'deliveryKey',
      label: 'Delivery key',
      icon: 'IconKey',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_EXPECTED_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'expectedUnknownAt',
      label: 'Expected unknown at',
      icon: 'IconClockQuestion',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_ACTOR_WORKSPACE_MEMBER_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'actorWorkspaceMemberId',
      label: 'Actor workspace member ID',
      icon: 'IconUserCheck',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_REASON_DIGEST_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'reasonDigest',
      label: 'Reason digest',
      icon: 'IconHash',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_AUDIT_REQUESTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'requestedAt',
      label: 'Requested at',
      icon: 'IconCalendarTime',
    },
  ],
});
