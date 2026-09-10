import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  TELEGRAM_DELIVERY_APPROVED_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_ATTEMPTS_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_LAST_REASON_CODE_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_OPERATION_DIGEST_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_REASON_OPTION_UNIVERSAL_IDENTIFIERS,
  TELEGRAM_DELIVERY_RESET_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_RETRY_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_STATE_TOKEN_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS,
  TELEGRAM_DELIVERY_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/modules/telegram/telegram-persistence-identifiers';

export default defineObject({
  universalIdentifier: TELEGRAM_DELIVERY_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'telegramDelivery',
  namePlural: 'telegramDeliveries',
  labelSingular: 'Telegram delivery',
  labelPlural: 'Telegram deliveries',
  description:
    'Durable, operator-visible state for one idempotent Telegram delivery',
  icon: 'IconBrandTelegram',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    TELEGRAM_DELIVERY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: TELEGRAM_DELIVERY_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconTag',
      defaultValue: "''",
    },
    {
      universalIdentifier: TELEGRAM_DELIVERY_KEY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'deliveryKey',
      label: 'Delivery key',
      icon: 'IconKey',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_OPERATION_DIGEST_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'operationDigest',
      label: 'Operation digest',
      icon: 'IconHash',
    },
    {
      universalIdentifier: TELEGRAM_DELIVERY_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgress',
      defaultValue: "'ready'",
      options: [
        {
          id: TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.ready,
          value: 'ready',
          label: 'Ready',
          position: 0,
          color: 'gray',
        },
        {
          id: TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.retryApproved,
          value: 'retry_approved',
          label: 'Retry approved',
          position: 1,
          color: 'blue',
        },
        {
          id: TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.intent,
          value: 'intent',
          label: 'Sending',
          position: 2,
          color: 'orange',
        },
        {
          id: TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.unknown,
          value: 'unknown',
          label: 'Unknown',
          position: 3,
          color: 'red',
        },
        {
          id: TELEGRAM_DELIVERY_STATUS_OPTION_UNIVERSAL_IDENTIFIERS.complete,
          value: 'complete',
          label: 'Complete',
          position: 4,
          color: 'green',
        },
      ],
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_STATE_TOKEN_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'stateToken',
      label: 'State token',
      icon: 'IconLock',
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_ATTEMPTS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'attempts',
      label: 'Attempts',
      icon: 'IconRepeat',
      defaultValue: 0,
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_RESET_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'resetCount',
      label: 'Reset count',
      icon: 'IconRefresh',
      defaultValue: 0,
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'unknownAt',
      label: 'Unknown at',
      icon: 'IconClockQuestion',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_LAST_REASON_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'lastReasonCode',
      label: 'Last reason code',
      icon: 'IconAlertTriangle',
      isNullable: true,
      options: [
        {
          id: TELEGRAM_DELIVERY_REASON_OPTION_UNIVERSAL_IDENTIFIERS.providerAmbiguous,
          value: 'provider_ambiguous',
          label: 'Provider ambiguous',
          position: 0,
          color: 'red',
        },
        {
          id: TELEGRAM_DELIVERY_REASON_OPTION_UNIVERSAL_IDENTIFIERS.checkpointAmbiguous,
          value: 'checkpoint_ambiguous',
          label: 'Checkpoint ambiguous',
          position: 1,
          color: 'orange',
        },
      ],
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_RETRY_REQUEST_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'retryRequestId',
      label: 'Retry request ID',
      icon: 'IconId',
      isNullable: true,
    },
    {
      universalIdentifier:
        TELEGRAM_DELIVERY_APPROVED_UNKNOWN_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'approvedUnknownAt',
      label: 'Approved unknown at',
      icon: 'IconCalendarCheck',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
