import { timingSafeEqual } from 'node:crypto';

import { type ParsedTelegramUpdate } from 'src/modules/telegram/types';

const safeEqual = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
};

export const assertTelegramWebhookSecret = (
  provided: string | undefined,
  expected: string | undefined,
): void => {
  if (!provided || !expected || !safeEqual(provided, expected)) {
    throw new Error('Unauthorized Telegram webhook');
  }
};

type TelegramEnvelope = {
  update_id?: unknown;
  message?: unknown;
  callback_query?: unknown;
};

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;

export const parseTelegramUpdate = (value: unknown): ParsedTelegramUpdate => {
  const envelope = object(value) as TelegramEnvelope | undefined;
  const updateId = envelope?.update_id;
  if (!Number.isSafeInteger(updateId)) {
    throw new Error('Invalid Telegram update id');
  }

  const callback = object(envelope?.callback_query);
  const message = object(callback?.message ?? envelope?.message);
  const from = object(callback?.from ?? message?.from);
  const chat = object(message?.chat);
  const text = callback ? callback.data : message?.text;
  if (
    !message ||
    !from ||
    !chat ||
    !Number.isSafeInteger(from.id) ||
    from.is_bot !== false ||
    !Number.isSafeInteger(chat.id) ||
    typeof text !== 'string' ||
    !Number.isSafeInteger(message.date) ||
    (message.date as number) <= 0 ||
    !text.trim()
  ) {
    throw new Error('Invalid Telegram command update');
  }
  if (chat.type !== 'private') {
    throw new Error('Telegram commands must use a private chat');
  }

  return {
    updateId: updateId as number,
    userId: String(from.id),
    chatId: String(chat.id),
    firstName:
      typeof from.first_name === 'string' && from.first_name.trim()
        ? from.first_name.trim()
        : 'there',
    text: text.trim(),
    messageTimestamp: new Date((message.date as number) * 1000).toISOString(),
    ...(callback && typeof callback.id === 'string'
      ? { callbackQueryId: callback.id }
      : {}),
  };
};

export const parseQueuedTelegramUpdate = (
  value: unknown,
): ParsedTelegramUpdate => {
  const update = object(value);
  if (
    !update ||
    !Number.isSafeInteger(update.updateId) ||
    typeof update.userId !== 'string' ||
    !/^[1-9][0-9]*$/.test(update.userId) ||
    typeof update.chatId !== 'string' ||
    !/^-?[1-9][0-9]*$/.test(update.chatId) ||
    typeof update.firstName !== 'string' ||
    !update.firstName.trim() ||
    typeof update.text !== 'string' ||
    !update.text.trim() ||
    typeof update.messageTimestamp !== 'string' ||
    !Number.isFinite(Date.parse(update.messageTimestamp))
  ) {
    throw new Error('Invalid queued Telegram update');
  }
  return {
    updateId: update.updateId as number,
    userId: update.userId,
    chatId: update.chatId,
    firstName: update.firstName.trim(),
    text: update.text.trim(),
    messageTimestamp: new Date(update.messageTimestamp).toISOString(),
    ...(typeof update.callbackQueryId === 'string' && update.callbackQueryId
      ? { callbackQueryId: update.callbackQueryId }
      : {}),
  };
};
