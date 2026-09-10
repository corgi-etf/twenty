import { createHash, randomUUID } from 'node:crypto';

import {
  type KeyValueStore,
  type ParsedTelegramUpdate,
} from 'src/modules/telegram/types';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';
import {
  type CoreTelegramDeliveryRepository,
  type TelegramDeliveryRecord,
} from 'src/modules/telegram/graphql/core-telegram-delivery.repository';
import { getTelegramDeliveryId } from 'src/modules/telegram/services/telegram-identifiers.service';

export type TelegramRetryEnvelope =
  | { kind: 'message'; chatId: string; text: string }
  | { kind: 'callback'; callbackQueryId: string };

export type TelegramDeliveryState = {
  status: 'ready' | 'retry_approved' | 'intent' | 'unknown' | 'complete';
  createdAt: string;
  updatedAt: string;
  unknownAt?: string;
  attempts: number;
  resetCount: number;
  lastReasonCode?: 'provider_ambiguous' | 'checkpoint_ambiguous';
  retryRequestId?: string;
  approvedUnknownAt?: string;
  retryEnvelope: TelegramRetryEnvelope;
};

const DELIVERY_KEY_PATTERN = /^telegram:delivery:[0-9a-f]{64}$/;

export const assertTelegramDeliveryKey = (deliveryKey: string): void => {
  if (!DELIVERY_KEY_PATTERN.test(deliveryKey)) {
    throw new Error('Invalid opaque Telegram delivery key');
  }
};

export const buildTelegramDeliveryKey = (scope: string): string => {
  if (!scope.trim()) throw new Error('Telegram delivery scope is required');
  return `telegram:delivery:${createHash('sha256').update(scope).digest('hex')}`;
};

const unknownEvent = (
  deliveryKey: string,
  state: TelegramDeliveryState,
) => ({
  event: 'telegram_delivery_unknown' as const,
  deliveryKey,
  status: 'unknown' as const,
  unknownAt: state.unknownAt,
  reasonCode: state.lastReasonCode,
});

const envelopeKey = (deliveryKey: string) =>
  `telegram:delivery-envelope:${deliveryKey.slice('telegram:delivery:'.length)}`;

const digestEnvelope = (envelope: TelegramRetryEnvelope) =>
  createHash('sha256').update(JSON.stringify(envelope)).digest('hex');

const persistExactEnvelope = async (
  store: KeyValueStore,
  deliveryKey: string,
  envelope: TelegramRetryEnvelope,
) => {
  const key = envelopeKey(deliveryKey);
  const existing = (await store.get(key)) as TelegramRetryEnvelope | null;
  if (existing && JSON.stringify(existing) !== JSON.stringify(envelope)) {
    throw new Error('Telegram delivery envelope collision');
  }
  if (!existing) await store.set(key, envelope);
};

export const readTelegramRetryEnvelope = async (
  store: KeyValueStore,
  deliveryKey: string,
) => (await store.get(envelopeKey(deliveryKey))) as TelegramRetryEnvelope | null;

const durableUnknownEvent = (
  record: TelegramDeliveryRecord,
  reasonCode: 'provider_ambiguous' | 'checkpoint_ambiguous',
) => ({
  event: 'telegram_delivery_unknown' as const,
  deliveryKey: record.deliveryKey,
  status: 'unknown' as const,
  unknownAt: record.unknownAt,
  reasonCode,
});

const deliverWithAtomicRepository = async ({
  deliveryKey,
  retryEnvelope,
  store,
  repository,
  perform,
  now,
  onUnknown,
}: {
  deliveryKey: string;
  retryEnvelope: TelegramRetryEnvelope;
  store: KeyValueStore;
  repository: CoreTelegramDeliveryRepository;
  perform(envelope: TelegramRetryEnvelope): Promise<void>;
  now(): Date;
  onUnknown(event: ReturnType<typeof durableUnknownEvent>): void;
}) => {
  await persistExactEnvelope(store, deliveryKey, retryEnvelope);
  const timestamp = now().toISOString();
  const seed: TelegramDeliveryRecord = {
    id: getTelegramDeliveryId(deliveryKey),
    deliveryKey,
    operationDigest: digestEnvelope(retryEnvelope),
    status: 'intent',
    stateToken: randomUUID(),
    attempts: 1,
    resetCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const claim = await repository.claim(seed);
  let intent = claim.record;
  if (!claim.acquired) {
    if (intent.status === 'complete') return { status: 'complete' } as const;
    if (intent.status === 'unknown') return { status: 'unknown' } as const;
    if (intent.status === 'intent') {
      const unknownAt = now().toISOString();
      const transitioned = await repository.transition({
        id: intent.id,
        expectedStatus: 'intent',
        expectedStateToken: intent.stateToken,
        patch: {
          status: 'unknown',
          stateToken: randomUUID(),
          unknownAt,
          updatedAt: unknownAt,
          lastReasonCode: 'checkpoint_ambiguous',
        },
      });
      const unknown = transitioned
        ? { ...intent, status: 'unknown' as const, unknownAt }
        : await repository.get(deliveryKey);
      if (unknown?.status === 'complete') {
        return { status: 'complete' } as const;
      }
      if (!unknown || unknown.status !== 'unknown') {
        throw new Error('Could not confirm ambiguous Telegram delivery claim');
      }
      onUnknown(durableUnknownEvent(unknown, 'checkpoint_ambiguous'));
      return { status: 'unknown' } as const;
    }
    const nextToken = randomUUID();
    const transitioned = await repository.transition({
      id: intent.id,
      expectedStatus: intent.status,
      expectedStateToken: intent.stateToken,
      patch: {
        status: 'intent',
        stateToken: nextToken,
        attempts: intent.attempts + 1,
        updatedAt: timestamp,
        unknownAt: null,
        lastReasonCode: null,
      },
    });
    if (!transitioned) return { status: 'unknown' } as const;
    intent = {
      ...intent,
      status: 'intent',
      stateToken: nextToken,
      attempts: intent.attempts + 1,
    };
  }

  try {
    await perform(retryEnvelope);
  } catch (error) {
    if (error instanceof TelegramDeliveryError && !error.mayHaveSucceeded) {
      const readyAt = now().toISOString();
      await repository.transition({
        id: intent.id,
        expectedStatus: 'intent',
        expectedStateToken: intent.stateToken,
        patch: {
          status: 'ready',
          stateToken: randomUUID(),
          updatedAt: readyAt,
        },
      });
      throw error;
    }
    const unknownAt = now().toISOString();
    await repository.transition({
      id: intent.id,
      expectedStatus: 'intent',
      expectedStateToken: intent.stateToken,
      patch: {
        status: 'unknown',
        stateToken: randomUUID(),
        updatedAt: unknownAt,
        unknownAt,
        lastReasonCode: 'provider_ambiguous',
      },
    });
    const unknown = (await repository.get(deliveryKey)) ?? {
      ...intent,
      status: 'unknown' as const,
      unknownAt,
    };
    onUnknown(durableUnknownEvent(unknown, 'provider_ambiguous'));
    return { status: 'unknown' } as const;
  }
  let completed: boolean;
  try {
    completed = await repository.transition({
      id: intent.id,
      expectedStatus: 'intent',
      expectedStateToken: intent.stateToken,
      patch: {
        status: 'complete',
        stateToken: randomUUID(),
        updatedAt: now().toISOString(),
      },
    });
  } catch {
    const unknownAt = now().toISOString();
    const unknown = { ...intent, status: 'unknown' as const, unknownAt };
    try {
      await repository.transition({
        id: intent.id,
        expectedStatus: 'intent',
        expectedStateToken: intent.stateToken,
        patch: {
          status: 'unknown',
          stateToken: randomUUID(),
          updatedAt: unknownAt,
          unknownAt,
          lastReasonCode: 'checkpoint_ambiguous',
        },
      });
    } finally {
      onUnknown(durableUnknownEvent(unknown, 'checkpoint_ambiguous'));
    }
    return { status: 'unknown' } as const;
  }
  if (!completed) {
    const current = await repository.get(deliveryKey);
    if (current?.status === 'complete') return { status: 'complete' } as const;
    if (current?.status === 'unknown') return { status: 'unknown' } as const;
    throw new Error('Telegram delivery completion checkpoint failed');
  }
  return { status: 'complete' } as const;
};

export const deliverTelegramOperation = async ({
  deliveryKey,
  retryEnvelope,
  store,
  perform,
  now,
  onUnknown = (event) => console.error(JSON.stringify(event)),
  repository,
}: {
  deliveryKey: string;
  retryEnvelope: TelegramRetryEnvelope;
  store: KeyValueStore;
  perform(envelope: TelegramRetryEnvelope): Promise<void>;
  now(): Date;
  onUnknown?(event: ReturnType<typeof unknownEvent>): void;
  repository?: CoreTelegramDeliveryRepository;
}) => {
  assertTelegramDeliveryKey(deliveryKey);
  if (repository) {
    return deliverWithAtomicRepository({
      deliveryKey,
      retryEnvelope,
      store,
      repository,
      perform,
      now,
      onUnknown,
    });
  }
  const existing = (await store.get(deliveryKey)) as TelegramDeliveryState | null;
  if (existing?.status === 'complete') return { status: 'complete' } as const;
  if (existing?.status === 'unknown') return { status: 'unknown' } as const;
  if (existing?.status === 'intent') {
    const timestamp = now().toISOString();
    const unknown: TelegramDeliveryState = {
      ...existing,
      status: 'unknown',
      updatedAt: timestamp,
      unknownAt: timestamp,
      lastReasonCode: 'checkpoint_ambiguous',
    };
    await store.set(deliveryKey, unknown);
    onUnknown(unknownEvent(deliveryKey, unknown));
    return { status: 'unknown' } as const;
  }

  const timestamp = now().toISOString();
  const base: TelegramDeliveryState = existing ?? {
    status: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    resetCount: 0,
    retryEnvelope,
  };
  const intent: TelegramDeliveryState = {
    ...base,
    status: 'intent',
    updatedAt: timestamp,
    attempts: base.attempts + 1,
    retryEnvelope,
  };
  delete intent.unknownAt;
  delete intent.lastReasonCode;
  await store.set(deliveryKey, intent);
  try {
    await perform(retryEnvelope);
  } catch (error) {
    if (
      error instanceof TelegramDeliveryError &&
      error.mayHaveSucceeded === false
    ) {
      const ready: TelegramDeliveryState = {
        ...intent,
        status: 'ready',
        updatedAt: now().toISOString(),
      };
      try {
        await store.set(deliveryKey, ready);
      } catch {
        // A provider-declared rejection proves no message was accepted. Retry
        // this state checkpoint once while that proof is still in-process so a
        // transient store failure does not turn a safe retry into ambiguity.
        await store.set(deliveryKey, ready);
      }
      throw error;
    }
    const unknownAt = now().toISOString();
    const unknown: TelegramDeliveryState = {
      ...intent,
      status: 'unknown',
      updatedAt: unknownAt,
      unknownAt,
      lastReasonCode: 'provider_ambiguous',
    };
    await store.set(deliveryKey, unknown);
    onUnknown(unknownEvent(deliveryKey, unknown));
    return { status: 'unknown' } as const;
  }
  await store.set(deliveryKey, {
    ...intent,
    status: 'complete',
    updatedAt: now().toISOString(),
  });
  return { status: 'complete' } as const;
};

export const enqueueTelegramUpdateOnce = async ({
  update,
  store,
  enqueue,
}: {
  update: ParsedTelegramUpdate;
  store: KeyValueStore;
  enqueue(payload: Record<string, unknown>, jobId: string): Promise<unknown>;
}) => {
  const key = `telegram:update:${update.updateId}`;
  const state = (await store.get(key)) as { status?: string } | null;
  if (state?.status === 'complete') {
    return { status: 'duplicate' } as const;
  }
  // The queue's unique deterministic job ID is the authoritative admission
  // claim. No KV marker is written before enqueue, so a process crash after
  // queue acceptance is recovered by retrying the exact same job ID.
  await enqueue(update, `telegram-update-${update.updateId}`);
  return { status: 'enqueued' } as const;
};

type Delivery = {
  workspaceMemberId: string;
  chatId: string;
  messages: string[];
};

export const deliverDailySummary = async ({
  localDate,
  delivery,
  store,
  send,
}: {
  localDate: string;
  delivery: Delivery;
  store: KeyValueStore;
  send(chatId: string, text: string): Promise<void>;
}) => {
  let part = 0;
  for (const message of delivery.messages) {
    const result = await deliverTelegramOperation({
      deliveryKey: buildTelegramDeliveryKey(
        `daily:${localDate}:${delivery.workspaceMemberId}:${part}`,
      ),
      retryEnvelope: { kind: 'message', chatId: delivery.chatId, text: message },
      store,
      perform: (envelope) =>
        envelope.kind === 'message'
          ? send(envelope.chatId, envelope.text)
          : Promise.reject(new Error('Invalid daily Telegram envelope')),
      now: () => new Date(),
    });
    if (result.status === 'unknown') {
      return { status: 'unknown', sentParts: part } as const;
    }
    part += 1;
  }

  return { status: 'complete', sentParts: part } as const;
};
