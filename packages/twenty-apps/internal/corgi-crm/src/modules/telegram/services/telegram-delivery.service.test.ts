import { describe, expect, it, vi } from 'vitest';

import {
  deliverDailySummary,
  enqueueTelegramUpdateOnce,
} from 'src/modules/telegram/services/telegram-delivery.service';
import * as deliveryModule from 'src/modules/telegram/services/telegram-delivery.service';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';

const queuedUpdate = {
  updateId: 42,
  userId: '101',
  chatId: '101',
  firstName: 'Nash',
  text: '/log call | Acme | connected',
  messageTimestamp: '2026-09-10T04:59:00.000Z',
};

describe('enqueueTelegramUpdateOnce', () => {
  it('uses the update id as a durable dedupe key', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const enqueue = vi.fn().mockResolvedValue({ enqueued: true });

    await expect(
      enqueueTelegramUpdateOnce({ update: queuedUpdate, store, enqueue }),
    ).resolves.toEqual({ status: 'enqueued' });
    expect(enqueue).toHaveBeenCalledWith(
      queuedUpdate,
      'telegram-update-42',
    );
    expect(store.set).not.toHaveBeenCalled();

    store.get.mockResolvedValue({ status: 'complete' });
    await expect(
      enqueueTelegramUpdateOnce({ update: queuedUpdate, store, enqueue }),
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
    const input = { update: queuedUpdate, store, enqueue };
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
      enqueueTelegramUpdateOnce({ update: queuedUpdate, store, enqueue }),
      enqueueTelegramUpdateOnce({ update: queuedUpdate, store, enqueue }),
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
      expect.stringMatching(/^telegram:delivery:[0-9a-f]{64}$/),
      expect.objectContaining({ status: 'complete' }),
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

describe('durable interactive Telegram delivery', () => {
  const api = deliveryModule as unknown as {
    buildTelegramDeliveryKey?: (scope: string) => string;
    deliverTelegramOperation?: (input: Record<string, unknown>) => Promise<unknown>;
  };

  const setup = () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => values.set(key, value)),
      delete: vi.fn(async (key: string) => values.delete(key)),
    };
    return { values, store };
  };

  it('uses an opaque stable key and persists intent before a confirmed send', async () => {
    expect(typeof api.buildTelegramDeliveryKey).toBe('function');
    expect(typeof api.deliverTelegramOperation).toBe('function');
    if (!api.buildTelegramDeliveryKey || !api.deliverTelegramOperation) return;
    const key = api.buildTelegramDeliveryKey('interactive:42:message:0');
    expect(key).toMatch(/^telegram:delivery:[0-9a-f]{64}$/);
    expect(key).not.toContain('42');
    const { store } = setup();
    const perform = vi.fn().mockResolvedValue(undefined);
    await expect(
      api.deliverTelegramOperation({
        deliveryKey: key,
        retryEnvelope: { kind: 'message', chatId: '101', text: 'secret text' },
        store,
        perform,
        now: () => new Date('2026-09-09T22:00:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'complete' });
    expect(store.set.mock.calls[0]?.[1]).toMatchObject({ status: 'intent' });
    expect(store.set).toHaveBeenLastCalledWith(
      key,
      expect.objectContaining({ status: 'complete' }),
    );
    expect(perform).toHaveBeenCalledOnce();
  });

  it('never contacts Telegram when the intent write fails', async () => {
    expect(typeof api.deliverTelegramOperation).toBe('function');
    if (!api.deliverTelegramOperation) return;
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('KV unavailable')),
      delete: vi.fn(),
    };
    const perform = vi.fn();
    await expect(
      api.deliverTelegramOperation({
        deliveryKey: 'telegram:delivery:' + 'a'.repeat(64),
        retryEnvelope: { kind: 'message', chatId: '101', text: 'hello' },
        store,
        perform,
        now: () => new Date(),
      }),
    ).rejects.toThrow(/KV unavailable/);
    expect(perform).not.toHaveBeenCalled();
  });

  it('marks ambiguous outcomes unknown and does not resend after a checkpoint crash', async () => {
    expect(typeof api.deliverTelegramOperation).toBe('function');
    if (!api.deliverTelegramOperation) return;
    const key = 'telegram:delivery:' + 'b'.repeat(64);
    const { values, store } = setup();
    const alerts: unknown[] = [];
    const acceptedTimeout = vi
      .fn()
      .mockRejectedValue(
        new TelegramDeliveryError('Telegram request outcome is unknown', true),
      );
    const input = {
      deliveryKey: key,
      retryEnvelope: { kind: 'message', chatId: '101', text: 'do not expose' },
      store,
      perform: acceptedTimeout,
      onUnknown: (event: unknown) => alerts.push(event),
      now: () => new Date('2026-09-09T22:00:00.000Z'),
    };
    await expect(api.deliverTelegramOperation(input)).resolves.toEqual({
      status: 'unknown',
    });
    await expect(api.deliverTelegramOperation(input)).resolves.toEqual({
      status: 'unknown',
    });
    expect(acceptedTimeout).toHaveBeenCalledOnce();
    expect(values.get(key)).toMatchObject({
      status: 'unknown',
      unknownAt: '2026-09-09T22:00:00.000Z',
    });
    expect(JSON.stringify(alerts)).not.toContain('do not expose');

    const checkpointValues = new Map<string, unknown>();
    let writes = 0;
    const checkpointStore = {
      get: vi.fn(async (stateKey: string) => checkpointValues.get(stateKey) ?? null),
      set: vi.fn(async (stateKey: string, value: unknown) => {
        writes += 1;
        if (writes === 2) throw new Error('crash after accepted send');
        checkpointValues.set(stateKey, value);
      }),
      delete: vi.fn(),
    };
    const send = vi.fn().mockResolvedValue(undefined);
    const checkpointInput = { ...input, store: checkpointStore, perform: send };
    await expect(api.deliverTelegramOperation(checkpointInput)).rejects.toThrow(
      /crash after accepted send/,
    );
    await expect(api.deliverTelegramOperation(checkpointInput)).resolves.toEqual({
      status: 'unknown',
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('retries only an explicit provider rejection', async () => {
    expect(typeof api.deliverTelegramOperation).toBe('function');
    if (!api.deliverTelegramOperation) return;
    const { store } = setup();
    const perform = vi
      .fn()
      .mockRejectedValueOnce(
        new TelegramDeliveryError('Telegram rejected the message', false),
      )
      .mockResolvedValueOnce(undefined);
    const input = {
      deliveryKey: 'telegram:delivery:' + 'c'.repeat(64),
      retryEnvelope: { kind: 'callback', callbackQueryId: 'callback-1' },
      store,
      perform,
      now: () => new Date(),
    };
    await expect(api.deliverTelegramOperation(input)).rejects.toThrow(/rejected/);
    await expect(api.deliverTelegramOperation(input)).resolves.toEqual({
      status: 'complete',
    });
    expect(perform).toHaveBeenCalledTimes(2);
  });
});
