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
    expect(enqueue).toHaveBeenCalledWith(
      { update_id: 42 },
      'telegram-update-42',
    );
    expect(store.set).not.toHaveBeenCalled();

    store.get.mockResolvedValue({ status: 'complete' });
    await expect(
      enqueueTelegramUpdateOnce({ updateId: 42, payload: { update_id: 42 }, store, enqueue }),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('reuses the deterministic job id after a crash following queue acceptance', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };

    const acceptedJobIds = new Set<string>();
    let first = true;
    const enqueue = vi.fn(async (_payload: unknown, jobId: string) => {
      acceptedJobIds.add(jobId);
      if (first) {
        first = false;
        throw new Error('request crashed after acceptance');
      }
      return { enqueued: true };
    });
    const input = { updateId: 42, payload: { update_id: 42 }, store, enqueue };
    await expect(enqueueTelegramUpdateOnce(input)).rejects.toThrow(/crashed/);
    await expect(enqueueTelegramUpdateOnce(input)).resolves.toEqual({
      status: 'enqueued',
    });
    expect(acceptedJobIds).toEqual(new Set(['telegram-update-42']));
    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('concurrent webhook attempts address the same authoritative queue job', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const jobIds: string[] = [];
    const enqueue = vi.fn(async (_payload: unknown, jobId: string) => {
      jobIds.push(jobId);
      return { enqueued: true };
    });
    await Promise.all([
      enqueueTelegramUpdateOnce({ updateId: 42, payload: { update_id: 42 }, store, enqueue }),
      enqueueTelegramUpdateOnce({ updateId: 42, payload: { update_id: 42 }, store, enqueue }),
    ]);
    expect(jobIds).toEqual(['telegram-update-42', 'telegram-update-42']);
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
