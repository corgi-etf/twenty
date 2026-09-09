import { type KeyValueStore } from 'src/modules/telegram/types';

export const enqueueTelegramUpdateOnce = async ({
  updateId,
  payload,
  store,
  enqueue,
}: {
  updateId: number;
  payload: Record<string, unknown>;
  store: KeyValueStore;
  enqueue(payload: Record<string, unknown>, jobId: string): Promise<unknown>;
}) => {
  const key = `telegram:update:${updateId}`;
  const state = (await store.get(key)) as { status?: string } | null;
  if (state?.status === 'complete') {
    return { status: 'duplicate' } as const;
  }
  // The queue's unique deterministic job ID is the authoritative admission
  // claim. No KV marker is written before enqueue, so a process crash after
  // queue acceptance is recovered by retrying the exact same job ID.
  await enqueue(payload, `telegram-update-${updateId}`);
  return { status: 'enqueued' } as const;
};

type Delivery = {
  wholesalerId: string;
  chatId: string;
  messages: string[];
};

type DeliveryState = {
  status: 'sending' | 'complete';
  sentParts: number;
};

export const deliverDailySummaries = async ({
  localDate,
  deliveries,
  store,
  send,
}: {
  localDate: string;
  deliveries: Delivery[];
  store: KeyValueStore;
  send(chatId: string, text: string): Promise<void>;
}) => {
  let delivered = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const key = `telegram:daily-summary:${localDate}:${delivery.wholesalerId}`;
    const state = (await store.get(key)) as DeliveryState | null;
    if (state?.status === 'complete') {
      skipped += 1;
      continue;
    }
    let sentParts = Math.min(state?.sentParts ?? 0, delivery.messages.length);
    await store.set(key, { status: 'sending', sentParts });
    for (const message of delivery.messages.slice(sentParts)) {
      await send(delivery.chatId, message);
      sentParts += 1;
      await store.set(key, { status: 'sending', sentParts });
    }
    await store.set(key, { status: 'complete', sentParts });
    delivered += 1;
  }

  return { delivered, skipped };
};
