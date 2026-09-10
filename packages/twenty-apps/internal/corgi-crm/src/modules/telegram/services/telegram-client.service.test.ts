import { afterEach, describe, expect, it, vi } from 'vitest';

import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';

describe('TelegramClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts messages with the token only in the provider URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new TelegramClient({
      token: 'bot-secret',
      timeoutMs: 1_000,
    });

    await client.sendMessage('101', 'Daily report');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-secret/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '101', text: 'Daily report' }),
      }),
    );
  });

  it('targets an explicit forum topic without changing ordinary messages', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new TelegramClient({ token: 'bot-secret' });

    await client.sendMessage('-100123', 'Booked', 42);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-secret/sendMessage',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '-100123',
          text: 'Booked',
          message_thread_id: 42,
        }),
      }),
    );
  });

  it('redacts provider and token details from errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, description: 'bad bot-secret request' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new TelegramClient({
      token: 'bot-secret',
      timeoutMs: 1_000,
    });

    await expect(client.sendMessage('101', 'Daily report')).rejects.toThrow(
      'Telegram sendMessage failed with HTTP 401',
    );
    await expect(client.sendMessage('101', 'Daily report')).rejects.not.toThrow(
      /bot-secret/,
    );
  });

  it('classifies network and unconfirmed server failures as ambiguous', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('socket closed after write'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const client = new TelegramClient({
      token: 'bot-secret',
      timeoutMs: 1_000,
    });

    await expect(
      client.sendMessage('101', 'Daily report'),
    ).rejects.toMatchObject({
      mayHaveSucceeded: true,
    });
    await expect(
      client.sendMessage('101', 'Daily report'),
    ).rejects.toMatchObject({
      mayHaveSucceeded: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('permits retries only after a parsed provider rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error_code: 429 }), {
        status: 429,
      }),
    );
    await expect(
      new TelegramClient({ token: 'test-token' }).sendMessage('101', 'report'),
    ).rejects.toMatchObject({ mayHaveSucceeded: false });
  });

  it.each([200, 502, 503])(
    'treats an unreadable HTTP %s response as ambiguous',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('unreadable gateway response', { status }),
      );
      await expect(
        new TelegramClient({ token: 'test-token' }).sendMessage(
          '101',
          'report',
        ),
      ).rejects.toMatchObject({ mayHaveSucceeded: true });
    },
  );
});
