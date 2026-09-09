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
  enqueue(payload: Record<string, unknown>): Promise<unknown>;
}) => {
  const key = `telegram:update:${updateId}`;
  if (await store.get(key)) return { status: 'duplicate' } as const;
  await store.set(key, { status: 'queued' });
  try {
    await enqueue(payload);
    return { status: 'enqueued' } as const;
  } catch (error) {
    await store.delete(key).catch(() => false);
    throw error;
  }
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
    const state = await store.get<DeliveryState>(key);
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
