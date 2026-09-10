import { randomUUID } from 'node:crypto';

import { defineLogicFunction } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';
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
  readTelegramRetryEnvelope,
  type TelegramRetryEnvelope,
} from 'src/modules/telegram/services/telegram-delivery.service';
import { type KeyValueStore } from 'src/modules/telegram/types';
import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';

type RetryWorkerDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  store: KeyValueStore;
  repository?: CoreTelegramDeliveryRepository;
  createTelegramClient(): Pick<
    TelegramClient,
    'sendMessage' | 'answerCallbackQuery'
  >;
  onUnknown?(event: unknown): void;
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
    await client.sendMessage(
      envelope.chatId,
      envelope.text,
      envelope.messageThreadId,
    );
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
  const repository = dependencies.repository;
  if (!repository) throw new Error('Telegram delivery repository is required');
  const payload = parsePayload(rawPayload);
  const audit = await readTelegramDeliveryResetAudit({
    requestId: payload.requestId,
    repository,
  });
  if (
    !audit ||
    audit.deliveryKey !== payload.deliveryKey ||
    audit.expectedUnknownAt !== payload.expectedUnknownAt ||
    audit.requestId !== payload.requestId
  ) {
    throw new Error('Telegram delivery retry lacks exact audit authorization');
  }
  let state = await repository.get(payload.deliveryKey);
  if (!state) {
    throw new Error('Telegram delivery retry is stale or replayed');
  }
  const matchesApprovedGeneration =
    state.retryRequestId === payload.requestId &&
    state.approvedUnknownAt === payload.expectedUnknownAt;
  if (state.status === 'complete') {
    if (!matchesApprovedGeneration) {
      throw new Error('Telegram delivery retry is stale or replayed');
    }
    return { status: 'complete' } as const;
  }
  if (state.status === 'unknown' && matchesApprovedGeneration) {
    return { status: 'unknown' } as const;
  }
  if (state.status === 'unknown') {
    if (state.unknownAt !== payload.expectedUnknownAt) {
      throw new Error('Telegram delivery retry is stale or replayed');
    }
    const nextState = {
      status: 'retry_approved',
      updatedAt: new Date().toISOString(),
      stateToken: randomUUID(),
      resetCount: state.resetCount + 1,
      retryRequestId: payload.requestId,
      approvedUnknownAt: payload.expectedUnknownAt,
    } as const;
    const approved = await repository.transition({
      id: state.id,
      expectedStatus: 'unknown',
      expectedStateToken: state.stateToken,
      patch: nextState,
    });
    state = approved
      ? { ...state, ...nextState }
      : ((await repository.get(payload.deliveryKey)) ?? state);
    if (
      state.retryRequestId !== payload.requestId ||
      state.approvedUnknownAt !== payload.expectedUnknownAt
    ) {
      throw new Error('Telegram delivery retry is stale or replayed');
    }
  } else if (!matchesApprovedGeneration) {
    throw new Error('Telegram delivery retry is stale or replayed');
  }

  let client:
    | Pick<TelegramClient, 'sendMessage' | 'answerCallbackQuery'>
    | undefined;
  const retryEnvelope = await readTelegramRetryEnvelope(
    dependencies.store,
    payload.deliveryKey,
  );
  if (!retryEnvelope) {
    throw new Error('Telegram delivery retry envelope is unavailable');
  }
  return deliverTelegramOperation({
    deliveryKey: payload.deliveryKey,
    retryEnvelope,
    store: dependencies.store,
    repository,
    perform: (envelope) => {
      client ??= dependencies.createTelegramClient();
      return performWithClient(client, envelope);
    },
    now: () => new Date(),
    onUnknown: dependencies.onUnknown,
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
    repository: new CoreTelegramDeliveryRepository(new CoreApiClient()),
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
