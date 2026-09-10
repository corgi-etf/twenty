import { describe, expect, it } from 'vitest';

import {
  assertTelegramWebhookSecret,
  parseQueuedTelegramUpdate,
  parseTelegramUpdate,
} from 'src/modules/telegram/services/telegram-security.service';

const GROUP_CHAT_ID = '-1002394851554';
const GROUP_THREAD_ID = 304311;
const ALLOWED_GROUP_TOPICS = [
  { chatId: GROUP_CHAT_ID, messageThreadId: GROUP_THREAD_ID },
];

const groupMessage = (messageOverrides: Record<string, unknown> = {}) => ({
  update_id: 42,
  message: {
    message_id: 304_319,
    from: { id: 101, is_bot: false, first_name: 'Nash' },
    chat: { id: Number(GROUP_CHAT_ID), type: 'supergroup', is_forum: true },
    message_thread_id: GROUP_THREAD_ID,
    date: 1_789_000_000,
    text: '/daily',
    is_topic_message: true,
    ...messageOverrides,
  },
});

describe('Telegram webhook security', () => {
  it('requires the configured secret token using an exact comparison', () => {
    expect(() => assertTelegramWebhookSecret('secret', 'secret')).not.toThrow();
    expect(() => assertTelegramWebhookSecret('other', 'secret')).toThrow(
      /unauthorized/i,
    );
    expect(() => assertTelegramWebhookSecret(undefined, 'secret')).toThrow(
      /unauthorized/i,
    );
  });

  it('accepts a minimal direct-message command update', () => {
    expect(
      parseTelegramUpdate({
        update_id: 42,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: false, first_name: 'Nash' },
          chat: { id: 101, type: 'private' },
          date: 1_789_000_000,
          text: '/today',
        },
      }),
    ).toMatchObject({
      updateId: 42,
      userId: '101',
      chatId: '101',
      text: '/today',
      messageTimestamp: '2026-09-10T00:26:40.000Z',
    });
  });

  it('requires an immutable Telegram source timestamp', () => {
    expect(() =>
      parseTelegramUpdate({
        update_id: 42,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: false, first_name: 'Nash' },
          chat: { id: 101, type: 'private' },
          text: '/log call | Acme | connected',
        },
      }),
    ).toThrow(/timestamp|date/i);
  });

  it('rejects group messages, bot senders, and malformed updates', () => {
    expect(() =>
      parseTelegramUpdate({ update_id: 42, message: { chat: { id: 1 } } }),
    ).toThrow(/invalid/i);
    expect(() =>
      parseTelegramUpdate({
        update_id: 42,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: true, first_name: 'Bot' },
          chat: { id: 101, type: 'private' },
          date: 1_789_000_000,
          text: '/today',
        },
      }),
    ).toThrow(/invalid/i);
    expect(() =>
      parseTelegramUpdate({
        update_id: 42,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: false, first_name: 'Nash' },
          chat: { id: -100, type: 'group' },
          date: 1_789_000_000,
          text: '/today',
        },
      }),
    ).toThrow(/private/i);
  });

  it('keeps a private update free of any group scope', () => {
    const update = parseTelegramUpdate(
      {
        update_id: 42,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: false, first_name: 'Nash' },
          chat: { id: 101, type: 'private' },
          date: 1_789_000_000,
          text: '/today',
        },
      },
      ALLOWED_GROUP_TOPICS,
    );
    expect(update.chatScope).toBe('private');
    expect(update).not.toHaveProperty('messageThreadId');
  });

  it('accepts an allowlisted supergroup topic and keeps its thread', () => {
    expect(
      parseTelegramUpdate(groupMessage(), ALLOWED_GROUP_TOPICS),
    ).toMatchObject({
      updateId: 42,
      userId: '101',
      chatId: GROUP_CHAT_ID,
      text: '/daily',
      chatScope: 'group_topic',
      messageThreadId: GROUP_THREAD_ID,
    });
  });

  it('refuses every group that is not exactly allowlisted', () => {
    // No allowlist configured at all is the default production posture.
    expect(() => parseTelegramUpdate(groupMessage())).toThrow(/private/i);
    expect(() =>
      parseTelegramUpdate(
        groupMessage({ chat: { id: -1002394851555, type: 'supergroup' } }),
        ALLOWED_GROUP_TOPICS,
      ),
    ).toThrow(/private/i);
    expect(() =>
      parseTelegramUpdate(
        groupMessage({ message_thread_id: GROUP_THREAD_ID + 1 }),
        ALLOWED_GROUP_TOPICS,
      ),
    ).toThrow(/private/i);
    expect(() =>
      parseTelegramUpdate(
        groupMessage({ chat: { id: Number(GROUP_CHAT_ID), type: 'group' } }),
        ALLOWED_GROUP_TOPICS,
      ),
    ).toThrow(/private/i);
  });

  it('refuses a supergroup message that carries no forum topic', () => {
    // Telegram omits message_thread_id for the General topic, which cannot be
    // pinned to one thread and so is never admitted.
    expect(() =>
      parseTelegramUpdate(
        groupMessage({ message_thread_id: undefined }),
        ALLOWED_GROUP_TOPICS,
      ),
    ).toThrow(/private/i);
    expect(() =>
      parseTelegramUpdate(
        groupMessage({ message_thread_id: 0 }),
        ALLOWED_GROUP_TOPICS,
      ),
    ).toThrow(/private/i);
  });

  it('carries the group scope across the queue and defaults older jobs to private', () => {
    const queued = {
      updateId: 42,
      userId: '101',
      chatId: GROUP_CHAT_ID,
      firstName: 'Nash',
      text: '/daily',
      messageTimestamp: '2026-09-09T22:00:00.000Z',
    };
    expect(
      parseQueuedTelegramUpdate({
        ...queued,
        chatScope: 'group_topic',
        messageThreadId: GROUP_THREAD_ID,
      }),
    ).toMatchObject({
      chatScope: 'group_topic',
      messageThreadId: GROUP_THREAD_ID,
    });
    expect(parseQueuedTelegramUpdate({ ...queued, chatId: '101' })).toMatchObject({
      chatScope: 'private',
    });
    expect(() =>
      parseQueuedTelegramUpdate({ ...queued, chatScope: 'group_topic' }),
    ).toThrow(/invalid/i);
    expect(() =>
      parseQueuedTelegramUpdate({
        ...queued,
        chatScope: 'private',
        messageThreadId: GROUP_THREAD_ID,
      }),
    ).toThrow(/invalid/i);
    expect(() =>
      parseQueuedTelegramUpdate({ ...queued, chatScope: 'supergroup' }),
    ).toThrow(/invalid/i);
  });
});
