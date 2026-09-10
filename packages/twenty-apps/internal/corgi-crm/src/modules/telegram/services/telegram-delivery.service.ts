import {
  type KeyValueStore,
  type ParsedTelegramUpdate,
} from 'src/modules/telegram/types';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';

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

type DeliveryState = {
  status: 'ready' | 'intent' | 'unknown' | 'complete';
  nextPart: number;
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
  const key = `telegram:daily-summary:${localDate}:${delivery.workspaceMemberId}`;
  const state = (await store.get(key)) as DeliveryState | null;
  const nextPart = Math.min(state?.nextPart ?? 0, delivery.messages.length);
  if (state?.status === 'complete') {
    return { status: 'complete', sentParts: nextPart } as const;
  }
  if (state?.status === 'intent' || state?.status === 'unknown') {
    if (state.status === 'intent') {
      await store.set(key, { status: 'unknown', nextPart });
    }
    return { status: 'unknown', sentParts: nextPart } as const;
  }

  let part = nextPart;
  for (const message of delivery.messages.slice(part)) {
    // Persist intent before contacting Telegram. If the worker crashes or the
    // provider response is ambiguous, a retry skips this part rather than
    // risking a duplicate daily message.
    await store.set(key, { status: 'intent', nextPart: part });
    try {
      await send(delivery.chatId, message);
    } catch (error) {
      if (
        error instanceof TelegramDeliveryError &&
        error.mayHaveSucceeded === false
      ) {
        await store.set(key, { status: 'ready', nextPart: part });
        throw error;
      }
      await store.set(key, { status: 'unknown', nextPart: part });
      return { status: 'unknown', sentParts: part } as const;
    }
    part += 1;
    await store.set(key, {
      status: part === delivery.messages.length ? 'complete' : 'ready',
      nextPart: part,
    });
  }

  return { status: 'complete', sentParts: part } as const;
};
