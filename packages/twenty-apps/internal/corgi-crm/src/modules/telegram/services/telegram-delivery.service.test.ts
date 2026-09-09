import { describe, expect, it, vi } from 'vitest';

import {
  deliverDailySummary,
  enqueueTelegramUpdateOnce,
} from 'src/modules/telegram/services/telegram-delivery.service';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';

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

describe('deliverDailySummary', () => {
  const delivery = {
    workspaceMemberId: '11111111-1111-4111-8111-111111111111',
    chatId: '101',
    messages: ['part one', 'part two'],
  };

  it('records intent before each part and marks confirmed delivery complete', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(
      deliverDailySummary({
        localDate: '2026-09-09',
        delivery,
        store,
        send,
      }),
    ).resolves.toEqual({ status: 'complete', sentParts: 2 });
    expect(send.mock.calls).toEqual([
      ['101', 'part one'],
      ['101', 'part two'],
    ]);
    expect(store.set).toHaveBeenLastCalledWith(
      `telegram:daily-summary:2026-09-09:${delivery.workspaceMemberId}`,
      { status: 'complete', nextPart: 2 },
    );
  });

  it.each(['intent', 'unknown'] as const)(
    'does not resend a part left in ambiguous %s state',
    async (status) => {
      const store = {
        get: vi.fn().mockResolvedValue({ status, nextPart: 0 }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(true),
      };
      const send = vi.fn();

      await expect(
        deliverDailySummary({
          localDate: '2026-09-09',
          delivery,
          store,
          send,
        }),
      ).resolves.toEqual({ status: 'unknown', sentParts: 0 });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('marks an accepted-timeout response unknown and never resends it', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockRejectedValue(
      new TelegramDeliveryError('Telegram request outcome is unknown', true),
    );

    await expect(
      deliverDailySummary({
        localDate: '2026-09-09',
        delivery,
        store,
        send,
      }),
    ).resolves.toEqual({ status: 'unknown', sentParts: 0 });
    await expect(
      deliverDailySummary({
        localDate: '2026-09-09',
        delivery,
        store,
        send,
      }),
    ).resolves.toEqual({ status: 'unknown', sentParts: 0 });
    expect(send).toHaveBeenCalledOnce();
  });

  it('retries only a provider response that proves the message was rejected', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        new TelegramDeliveryError('Telegram rejected the message', false),
      )
      .mockResolvedValue(undefined);

    await expect(
      deliverDailySummary({
        localDate: '2026-09-09',
        delivery,
        store,
        send,
      }),
    ).rejects.toThrow(/rejected/i);
    await expect(
      deliverDailySummary({
        localDate: '2026-09-09',
        delivery,
        store,
        send,
      }),
    ).resolves.toEqual({ status: 'complete', sentParts: 2 });

    expect(send).toHaveBeenCalledTimes(3);
  });
});
