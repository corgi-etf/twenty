import { describe, expect, it, vi } from 'vitest';

import { handleTelegramWebhook } from 'src/modules/telegram/telegram-webhook.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const context = {
  workspaceId: WORKSPACE_ID,
  retryCount: 0,
  maxRetries: 0,
  userWorkspaceId: null,
  workspaceMemberId: null,
} as never;

const baseDependencies = () => ({
  expectedWorkspaceId: WORKSPACE_ID,
  enabled: 'true',
  webhookSecret: 'secret',
  store: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() },
  enqueue: vi.fn().mockResolvedValue(undefined),
});

const request = (body: unknown) =>
  ({
    headers: { 'x-telegram-bot-api-secret-token': 'secret' },
    body,
  }) as never;

const validPrivateMessage = (
  overrides: Record<string, unknown> = {},
  messageOverrides: Record<string, unknown> = {},
) => ({
  update_id: 100,
  message: {
    message_id: 1,
    date: 1_700_000_000,
    text: '/help',
    chat: { id: 101, type: 'private' },
    from: { id: 101, is_bot: false, first_name: 'Nash' },
    ...messageOverrides,
  },
  ...overrides,
});

describe('handleTelegramWebhook', () => {
  it('enqueues a valid private-chat update and answers 202', async () => {
    const dependencies = baseDependencies();
    const response = await handleTelegramWebhook(
      request(validPrivateMessage()),
      context,
      dependencies,
    );
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true, accepted: true });
    expect(dependencies.enqueue).toHaveBeenCalledOnce();
  });

  it('acknowledges a duplicate update without re-enqueuing', async () => {
    const dependencies = baseDependencies();
    dependencies.store.get.mockResolvedValue({ status: 'complete' });
    const response = await handleTelegramWebhook(
      request(validPrivateMessage()),
      context,
      dependencies,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, accepted: false });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  // Telegram treats any non-2xx response as delivery failure and retries the
  // same update indefinitely, which wedges its queue until the update
  // expires (~24h) — every rejection below must come back 200, never 400.
  it.each([
    [
      'a non-text message (photo, sticker, voice note, document, location, contact)',
      validPrivateMessage({}, { text: undefined, photo: [{ file_id: 'abc' }] }),
    ],
    [
      'a group chat message',
      validPrivateMessage({}, { chat: { id: -100123, type: 'group' } }),
    ],
    [
      'a supergroup chat message',
      validPrivateMessage({}, { chat: { id: -100123, type: 'supergroup' } }),
    ],
    ['empty text', validPrivateMessage({}, { text: '' })],
    ['whitespace-only text', validPrivateMessage({}, { text: '   \n\t ' })],
    [
      'a bot sender',
      validPrivateMessage(
        {},
        { from: { id: 101, is_bot: true, first_name: 'SomeBot' } },
      ),
    ],
    ['a missing update_id', validPrivateMessage({ update_id: undefined })],
    ['a non-integer update_id', validPrivateMessage({ update_id: 'abc' })],
    ['a malformed body entirely', {}],
    ['a null body', null],
  ])('acknowledges rather than 400s on %s', async (_label, body) => {
    const dependencies = baseDependencies();
    const response = await handleTelegramWebhook(
      request(body),
      context,
      dependencies,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      accepted: false,
      status: 'ignored',
    });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
    expect(dependencies.store.get).not.toHaveBeenCalled();
    expect(dependencies.store.set).not.toHaveBeenCalled();
  });
});
