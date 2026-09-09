import { describe, expect, it } from 'vitest';

import {
  assertTelegramWebhookSecret,
  parseTelegramUpdate,
} from 'src/modules/telegram/services/telegram-security.service';

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
    ).toMatchObject({ updateId: 42, userId: '101', chatId: '101', text: '/today' });
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
});
