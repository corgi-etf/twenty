import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deliverGatedTestMessage,
  verifySignedWebhookCanary,
  verifyTelegramProvider,
} from './verify-telegram-live.mjs';

const okJson = (result) =>
  new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('live Telegram provider verification hooks', () => {
  it('verifies getMe plus the exact configured webhook without exposing credentials', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return calls.length === 1
        ? okJson({ id: 42, is_bot: true, username: 'corgi_bot' })
        : okJson({
            url: 'https://crm.corgiinvest.com/s/telegram/webhook',
            pending_update_count: 0,
            allowed_updates: ['message', 'callback_query'],
          });
    };

    await assert.doesNotReject(() =>
      verifyTelegramProvider({
        fetchImpl,
        token: 'bot-secret',
        expectedWebhookUrl:
          'https://crm.corgiinvest.com/s/telegram/webhook',
      }),
    );
    assert.match(calls[0].url, /\/getMe$/);
    assert.match(calls[1].url, /\/getWebhookInfo$/);
  });

  it('fails closed on a stale provider webhook or reported delivery error', async () => {
    const fetchImpl = async (url) =>
      String(url).endsWith('/getMe')
        ? okJson({ id: 42, is_bot: true })
        : okJson({
            url: 'https://wrong.example/telegram',
            last_error_date: 1,
            last_error_message: 'contains bot-secret',
            allowed_updates: ['message', 'callback_query'],
          });

    await assert.rejects(
      () =>
        verifyTelegramProvider({
          fetchImpl,
          token: 'bot-secret',
          expectedWebhookUrl:
            'https://crm.corgiinvest.com/s/telegram/webhook',
        }),
      (error) =>
        /webhook/i.test(error.message) && !/bot-secret/.test(error.message),
    );
  });

  it('requires a signed invalid-update canary to be accepted by routing and rejected by validation', async () => {
    const calls = [];
    const fetchImpl = async (_url, init) => {
      calls.push(init);
      return new Response('{}', { status: calls.length === 1 ? 400 : 401 });
    };

    await assert.doesNotReject(() =>
      verifySignedWebhookCanary({
        fetchImpl,
        webhookUrl: 'https://crm.corgiinvest.com/s/telegram/webhook',
        webhookSecret: 'webhook-secret',
      }),
    );
    assert.equal(
      calls[0].headers['x-telegram-bot-api-secret-token'],
      'webhook-secret',
    );
    assert.equal(
      calls[1].headers['x-telegram-bot-api-secret-token'],
      undefined,
    );
  });

  it('never sends a test message without both explicit gates and a chat ID', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return okJson({ message_id: 1 });
    };
    const base = {
      fetchImpl,
      token: 'bot-secret',
      chatId: '101',
      text: 'Corgi CRM Telegram verification',
    };

    assert.deepEqual(
      await deliverGatedTestMessage({
        ...base,
        enabled: false,
        confirmation: 'SEND_TELEGRAM_TEST',
      }),
      { status: 'skipped' },
    );
    await assert.rejects(() =>
      deliverGatedTestMessage({
        ...base,
        enabled: true,
        confirmation: 'wrong',
      }),
    );
    assert.equal(calls, 0);
    assert.deepEqual(
      await deliverGatedTestMessage({
        ...base,
        enabled: true,
        confirmation: 'SEND_TELEGRAM_TEST',
      }),
      { status: 'sent' },
    );
    assert.equal(calls, 1);
  });
});
