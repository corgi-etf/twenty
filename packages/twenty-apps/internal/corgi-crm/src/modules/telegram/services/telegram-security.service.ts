import { timingSafeEqual } from 'node:crypto';

import {
  isAllowedTelegramGroupTopic,
  type TelegramGroupTopic,
} from 'src/modules/telegram/services/telegram-group-topics.service';
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

const GROUP_TOPIC_REFUSAL =
  'Telegram commands must use a private chat or an allowed group topic';

// Telegram sends no message_thread_id for a forum's General topic
// (https://core.telegram.org/api/forum), so an allowlisted thread is the only
// group scope that can be pinned — and the only one this bot admits.
const parseGroupTopicScope = (
  chatId: string,
  chatType: unknown,
  messageThreadId: unknown,
  allowedGroupTopics: readonly TelegramGroupTopic[],
): { chatScope: 'group_topic'; messageThreadId: number } => {
  if (
    chatType !== 'supergroup' ||
    !Number.isSafeInteger(messageThreadId) ||
    (messageThreadId as number) <= 0
  ) {
    throw new Error(GROUP_TOPIC_REFUSAL);
  }
  const topic = { chatId, messageThreadId: messageThreadId as number };
  if (!isAllowedTelegramGroupTopic(topic, allowedGroupTopics)) {
    throw new Error(GROUP_TOPIC_REFUSAL);
  }
  return { chatScope: 'group_topic', messageThreadId: topic.messageThreadId };
};

export const parseTelegramUpdate = (
  value: unknown,
  allowedGroupTopics: readonly TelegramGroupTopic[] = [],
): ParsedTelegramUpdate => {
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
  const chatId = String(chat.id);
  const scope =
    chat.type === 'private'
      ? ({ chatScope: 'private' } as const)
      : parseGroupTopicScope(
          chatId,
          chat.type,
          message.message_thread_id,
          allowedGroupTopics,
        );

  return {
    ...scope,
    updateId: updateId as number,
    userId: String(from.id),
    chatId,
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
  // Every update queued before group topics existed was a private chat, so an
  // absent scope stays private instead of failing an in-flight job.
  const queuedScope = update.chatScope ?? 'private';
  const messageThreadId = update.messageThreadId;
  if (queuedScope !== 'private' && queuedScope !== 'group_topic') {
    throw new Error('Invalid queued Telegram update');
  }
  if (
    queuedScope === 'private'
      ? messageThreadId !== undefined
      : !Number.isSafeInteger(messageThreadId) ||
        (messageThreadId as number) <= 0
  ) {
    throw new Error('Invalid queued Telegram update');
  }
  const scope =
    queuedScope === 'group_topic'
      ? ({
          chatScope: 'group_topic',
          messageThreadId: messageThreadId as number,
        } as const)
      : ({ chatScope: 'private' } as const);
  return {
    ...scope,
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
