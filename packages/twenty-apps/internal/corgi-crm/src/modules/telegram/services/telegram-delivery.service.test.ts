import { describe, expect, it, vi } from 'vitest';

import {
  deliverDailySummaries,
  enqueueTelegramUpdateOnce,
} from 'src/modules/telegram/services/telegram-delivery.service';

describe('enqueueTelegramUpdateOnce', () => {
  it('uses the update id as a durable dedupe key', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const enqueue = vi.fn().mockResolvedValue({ enqueued: true });

    await expect(
      enqueueTelegramUpdateOnce({ updateId: 42, payload: { update_id: 42 }, store, enqueue }),
    ).resolves.toEqual({ status: 'enqueued' });
    expect(store.set).toHaveBeenCalledWith('telegram:update:42', {
      status: 'queued',
    });

    store.get.mockResolvedValue({ status: 'queued' });
    await expect(
      enqueueTelegramUpdateOnce({ updateId: 42, payload: { update_id: 42 }, store, enqueue }),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('releases a claim when queueing fails so Telegram can retry', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };

    await expect(
      enqueueTelegramUpdateOnce({
        updateId: 42,
        payload: { update_id: 42 },
        store,
        enqueue: vi.fn().mockRejectedValue(new Error('queue unavailable')),
      }),
    ).rejects.toThrow('queue unavailable');
    expect(store.delete).toHaveBeenCalledWith('telegram:update:42');
  });
});

describe('deliverDailySummaries', () => {
  it('claims each person and date, sends once, and marks delivery complete', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(
      deliverDailySummaries({
        localDate: '2026-09-09',
        deliveries: [
          { wholesalerId: 'wholesaler-1', chatId: '101', messages: ['part one', 'part two'] },
        ],
        store,
        send,
      }),
    ).resolves.toEqual({ delivered: 1, skipped: 0 });
    expect(send.mock.calls).toEqual([
      ['101', 'part one'],
      ['101', 'part two'],
    ]);
    expect(store.set).toHaveBeenLastCalledWith(
      'telegram:daily-summary:2026-09-09:wholesaler-1',
      { status: 'complete', sentParts: 2 },
    );

    store.get.mockResolvedValue({ status: 'complete', sentParts: 2 });
    await expect(
      deliverDailySummaries({
        localDate: '2026-09-09',
        deliveries: [
          { wholesalerId: 'wholesaler-1', chatId: '101', messages: ['part one', 'part two'] },
        ],
        store,
        send,
      }),
    ).resolves.toEqual({ delivered: 0, skipped: 1 });
  });

  it('resumes after the last confirmed message part', async () => {
    const store = {
      get: vi.fn().mockResolvedValue({ status: 'sending', sentParts: 1 }),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);

    await deliverDailySummaries({
      localDate: '2026-09-09',
      deliveries: [
        { wholesalerId: 'wholesaler-1', chatId: '101', messages: ['part one', 'part two'] },
      ],
      store,
      send,
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('101', 'part two');
  });
});
