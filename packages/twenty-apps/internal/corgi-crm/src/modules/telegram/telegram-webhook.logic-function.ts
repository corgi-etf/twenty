import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { enqueueJob, kv, Response } from 'twenty-sdk/logic-function';

import {
  TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER,
  TELEGRAM_WEBHOOK_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import { enqueueTelegramUpdateOnce } from 'src/modules/telegram/services/telegram-delivery.service';
import {
  assertTelegramWebhookSecret,
  parseTelegramUpdate,
} from 'src/modules/telegram/services/telegram-security.service';

export const handler = async (payload: RoutePayload<unknown>) => {
  try {
    assertTelegramWebhookSecret(
      payload.headers['x-telegram-bot-api-secret-token'],
      process.env.CORGI_CRM_TELEGRAM_WEBHOOK_SECRET,
    );
  } catch {
    return new Response({ ok: false }, { status: 401 });
  }

  let update;
  try {
    update = parseTelegramUpdate(payload.body);
  } catch {
    return new Response({ ok: false }, { status: 400 });
  }
  const result = await enqueueTelegramUpdateOnce({
    updateId: update.updateId,
    payload: payload.body as Record<string, unknown>,
    store: kv,
    enqueue: (jobPayload, jobId) =>
      enqueueJob({
        logicFunctionUniversalIdentifier:
          TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER,
        payload: jobPayload,
        jobId,
        retryLimit: 5,
      }),
  });
  return new Response(
    { ok: true, accepted: result.status === 'enqueued' },
    { status: result.status === 'enqueued' ? 202 : 200 },
  );
};

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_WEBHOOK_UNIVERSAL_IDENTIFIER,
  name: 'telegram-webhook',
  description:
    'Authenticates Telegram webhook updates and durably enqueues each update ID once.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/telegram/webhook',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: ['x-telegram-bot-api-secret-token'],
  },
});
