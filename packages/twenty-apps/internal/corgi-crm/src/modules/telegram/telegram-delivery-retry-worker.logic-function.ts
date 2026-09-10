import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_DELIVERY_RETRY_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import {
  readTelegramDeliveryResetAudit,
  type TelegramDeliveryResetJob,
} from 'src/modules/telegram/services/telegram-delivery-control.service';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import {
  assertTelegramDeliveryKey,
  deliverTelegramOperation,
  type TelegramDeliveryState,
  type TelegramRetryEnvelope,
} from 'src/modules/telegram/services/telegram-delivery.service';
import { type KeyValueStore } from 'src/modules/telegram/types';

type RetryWorkerDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  store: KeyValueStore;
  createTelegramClient(): Pick<
    TelegramClient,
    'sendMessage' | 'answerCallbackQuery'
  >;
};

const parsePayload = (value: unknown): TelegramDeliveryResetJob => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Telegram delivery retry job');
  }
  const payload = value as Record<string, unknown>;
  if (
    Object.keys(payload).sort().join(',') !==
      'deliveryKey,expectedUnknownAt,requestId' ||
    typeof payload.deliveryKey !== 'string' ||
    typeof payload.expectedUnknownAt !== 'string' ||
    typeof payload.requestId !== 'string'
  ) {
    throw new Error('Invalid Telegram delivery retry job');
  }
  assertTelegramDeliveryKey(payload.deliveryKey);
  return payload as TelegramDeliveryResetJob;
};

const performWithClient = async (
  client: Pick<TelegramClient, 'sendMessage' | 'answerCallbackQuery'>,
  envelope: TelegramRetryEnvelope,
) => {
  if (envelope.kind === 'message') {
    await client.sendMessage(envelope.chatId, envelope.text);
  } else {
    await client.answerCallbackQuery(envelope.callbackQueryId);
  }
};

export const handleTelegramDeliveryRetryJob = async (
  rawPayload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: RetryWorkerDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram delivery retry refused an unexpected workspace');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  const payload = parsePayload(rawPayload);
  const audit = await readTelegramDeliveryResetAudit({
    requestId: payload.requestId,
    store: dependencies.store,
  });
  if (
    !audit ||
    audit.action !== 'reset_requested' ||
    audit.deliveryKey !== payload.deliveryKey ||
    audit.expectedUnknownAt !== payload.expectedUnknownAt ||
    audit.requestId !== payload.requestId
  ) {
    throw new Error('Telegram delivery retry lacks exact audit authorization');
  }
  const state = (await dependencies.store.get(
    payload.deliveryKey,
  )) as TelegramDeliveryState | null;
  if (
    !state ||
    state.status !== 'unknown' ||
    state.unknownAt !== payload.expectedUnknownAt
  ) {
    throw new Error('Telegram delivery retry is stale or replayed');
  }
  const approved: TelegramDeliveryState = {
    ...state,
    status: 'retry_approved',
    updatedAt: new Date().toISOString(),
    resetCount: state.resetCount + 1,
  };
  await dependencies.store.set(payload.deliveryKey, approved);
  const client = dependencies.createTelegramClient();
  return deliverTelegramOperation({
    deliveryKey: payload.deliveryKey,
    retryEnvelope: state.retryEnvelope,
    store: dependencies.store,
    perform: (envelope) => performWithClient(client, envelope),
    now: () => new Date(),
  });
};

const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const handler = async (
  payload: unknown,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramDeliveryRetryJob(payload, context, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    store: kv,
    createTelegramClient: () =>
      new TelegramClient({
        token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
      }),
  });

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DELIVERY_RETRY_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-delivery-retry-worker',
  description:
    'Executes one exact audited retry of an otherwise terminal unknown Telegram delivery.',
  timeoutSeconds: 30,
  handler,
});
