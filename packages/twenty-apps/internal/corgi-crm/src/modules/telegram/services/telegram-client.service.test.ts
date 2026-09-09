import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TelegramClient,
  TelegramDeliveryError,
} from 'src/modules/telegram/services/telegram-client.service';

describe('TelegramClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts messages with the token only in the provider URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new TelegramClient({ token: 'bot-secret', timeoutMs: 1_000 });

    await client.sendMessage('101', 'Daily report');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-secret/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '101', text: 'Daily report' }),
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
    const client = new TelegramClient({ token: 'bot-secret', timeoutMs: 1_000 });

    await expect(client.sendMessage('101', 'Daily report')).rejects.toThrow(
      'Telegram sendMessage failed with HTTP 401',
    );
    await expect(client.sendMessage('101', 'Daily report')).rejects.not.toThrow(
      /bot-secret/,
    );
  });

  it('classifies network failures as ambiguous and explicit HTTP rejection as retryable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('socket closed after write'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const client = new TelegramClient({ token: 'bot-secret', timeoutMs: 1_000 });

    await expect(client.sendMessage('101', 'Daily report')).rejects.toMatchObject<
      Partial<TelegramDeliveryError>
    >({ mayHaveSucceeded: true });
    await expect(client.sendMessage('101', 'Daily report')).rejects.toMatchObject<
      Partial<TelegramDeliveryError>
    >({ mayHaveSucceeded: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
