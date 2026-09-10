import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import {
  enqueueJob,
  kv,
  type LogicFunctionExecutionContext,
  Response,
} from 'twenty-sdk/logic-function';

import {
  TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER,
  TELEGRAM_WEBHOOK_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import { enqueueTelegramUpdateOnce } from 'src/modules/telegram/services/telegram-delivery.service';
import {
  assertTelegramWebhookSecret,
  parseTelegramUpdate,
} from 'src/modules/telegram/services/telegram-security.service';
import {
  type KeyValueStore,
  type ParsedTelegramUpdate,
} from 'src/modules/telegram/types';

type WebhookDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  webhookSecret: string | undefined;
  store: KeyValueStore;
  enqueue(
    payload: ParsedTelegramUpdate,
    jobId: string,
  ): Promise<unknown>;
};

export const handleTelegramWebhook = async (
  payload: RoutePayload<unknown>,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: WebhookDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram webhook refused an unexpected workspace');
  }
  try {
    assertTelegramWebhookSecret(
      payload.headers['x-telegram-bot-api-secret-token'],
      dependencies.webhookSecret,
    );
  } catch {
    return new Response({ ok: false }, { status: 401 });
  }
  if (dependencies.enabled !== 'true') {
    return new Response(
      { ok: true, accepted: false, status: 'disabled' },
      { status: 200 },
    );
  }

  let update;
  try {
    update = parseTelegramUpdate(payload.body);
  } catch {
    // An update Telegram itself sent (a sticker, a group message, a bot
    // sender) but that this bot does not handle is not a delivery failure.
    // A non-2xx here tells Telegram to retry the same update indefinitely,
    // wedging its queue until the update expires — acknowledge and drop it
    // instead, the same way the disabled-app branch above does.
    return new Response(
      { ok: true, accepted: false, status: 'ignored' },
      { status: 200 },
    );
  }
  const result = await enqueueTelegramUpdateOnce({
    update,
    store: dependencies.store,
    enqueue: dependencies.enqueue,
  });
  return new Response(
    { ok: true, accepted: result.status === 'enqueued' },
    { status: result.status === 'enqueued' ? 202 : 200 },
  );
};

export const handler = async (
  payload: RoutePayload<unknown>,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramWebhook(payload, context, {
    expectedWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID?.trim() ?? '',
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    webhookSecret: process.env.CORGI_CRM_TELEGRAM_WEBHOOK_SECRET,
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
