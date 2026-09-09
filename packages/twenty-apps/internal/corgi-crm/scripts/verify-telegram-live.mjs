import { pathToFileURL } from 'node:url';

const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

const required = (value, label) => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const telegramCall = async ({ fetchImpl, token, method, body = {} }) => {
  let response;
  try {
    response = await fetchImpl(
      `${TELEGRAM_API_ORIGIN}/bot${required(token, 'Telegram token')}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
      },
    );
  } catch {
    throw new Error(`Telegram ${method} request failed`);
  }
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Telegram ${method} returned invalid JSON`);
  }
  if (payload?.ok !== true || !payload.result) {
    throw new Error(`Telegram ${method} rejected verification`);
  }
  return payload.result;
};

const verifyTelegramProvider = async ({
  fetchImpl,
  token,
  expectedWebhookUrl,
}) => {
  const webhookUrl = new URL(required(expectedWebhookUrl, 'Webhook URL'));
  if (webhookUrl.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }
  const bot = await telegramCall({ fetchImpl, token, method: 'getMe' });
  if (bot.is_bot !== true || !bot.id) {
    throw new Error('Telegram getMe did not return a bot identity');
  }
  const webhook = await telegramCall({
    fetchImpl,
    token,
    method: 'getWebhookInfo',
  });
  if (webhook.url !== webhookUrl.href) {
    throw new Error('Telegram webhook URL does not match the installed route');
  }
  if (webhook.last_error_date || webhook.last_error_message) {
    throw new Error('Telegram webhook reports a delivery error');
  }
  const updates = Array.isArray(webhook.allowed_updates)
    ? webhook.allowed_updates
    : [];
  if (!['message', 'callback_query'].every((name) => updates.includes(name))) {
    throw new Error('Telegram webhook allowed updates are incomplete');
  }
  return { botId: String(bot.id), username: bot.username ?? null };
};

const verifySignedWebhookCanary = async ({
  fetchImpl,
  webhookUrl,
  webhookSecret,
}) => {
  const url = new URL(required(webhookUrl, 'Webhook URL'));
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  const secret = required(webhookSecret, 'Webhook secret');
  const request = (headers) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
      redirect: 'error',
    });
  const signed = await request({
    'x-telegram-bot-api-secret-token': secret,
  });
  if (signed.status !== 400) {
    throw new Error('Signed Telegram route canary did not reach update validation');
  }
  const unsigned = await request({});
  if (unsigned.status !== 401) {
    throw new Error('Unsigned Telegram route canary was not rejected');
  }
  return { status: 'verified' };
};

const deliverGatedTestMessage = async ({
  fetchImpl,
  token,
  chatId,
  text,
  enabled,
  confirmation,
}) => {
  if (enabled !== true) return { status: 'skipped' };
  if (confirmation !== 'SEND_TELEGRAM_TEST') {
    throw new Error('Telegram test delivery requires explicit confirmation');
  }
  const target = required(chatId, 'Telegram test chat ID');
  if (!/^-?[1-9][0-9]*$/.test(target)) {
    throw new Error('Telegram test chat ID must be numeric');
  }
  await telegramCall({
    fetchImpl,
    token,
    method: 'sendMessage',
    body: { chat_id: target, text: required(text, 'Telegram test text') },
  });
  return { status: 'sent' };
};

const main = async () => {
  if (
    process.env.CORGI_CRM_TELEGRAM_LIVE_VERIFICATION_CONFIRM !==
    'VERIFY_TELEGRAM_LIVE'
  ) {
    throw new Error('Live Telegram verification requires explicit confirmation');
  }
  const token = required(
    process.env.CORGI_CRM_TELEGRAM_BOT_TOKEN,
    'Telegram token',
  );
  const webhookUrl = required(
    process.env.CORGI_CRM_TELEGRAM_WEBHOOK_URL,
    'Webhook URL',
  );
  await verifyTelegramProvider({
    fetchImpl: fetch,
    token,
    expectedWebhookUrl: webhookUrl,
  });
  if (
    process.env.CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM ===
    'RUN_SIGNED_CANARY'
  ) {
    await verifySignedWebhookCanary({
      fetchImpl: fetch,
      webhookUrl,
      webhookSecret: process.env.CORGI_CRM_TELEGRAM_WEBHOOK_SECRET,
    });
  }
  await deliverGatedTestMessage({
    fetchImpl: fetch,
    token,
    chatId: process.env.CORGI_CRM_TELEGRAM_TEST_CHAT_ID,
    text: 'Corgi CRM Telegram verification',
    enabled:
      process.env.CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED === 'true',
    confirmation: process.env.CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM,
  });
  console.log('Verified live Telegram bot and webhook configuration.');
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export {
  deliverGatedTestMessage,
  verifySignedWebhookCanary,
  verifyTelegramProvider,
};
