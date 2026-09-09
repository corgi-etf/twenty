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
    ...(callback && typeof callback.id === 'string'
      ? { callbackQueryId: callback.id }
      : {}),
  };
};
