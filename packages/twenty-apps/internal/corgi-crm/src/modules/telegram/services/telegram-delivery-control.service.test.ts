import { describe, expect, it, vi } from 'vitest';

import {
  inspectTelegramDelivery,
  requestTelegramDeliveryReset,
} from 'src/modules/telegram/services/telegram-delivery-control.service';

describe('Telegram unknown-delivery control', () => {
  const deliveryKey = `telegram:delivery:${'d'.repeat(64)}`;
  const unknownAt = '2026-09-09T22:00:00.000Z';
  const state = {
    status: 'unknown',
    createdAt: '2026-09-09T21:59:59.000Z',
    updatedAt: unknownAt,
    unknownAt,
    attempts: 1,
    resetCount: 0,
    lastReasonCode: 'provider_ambiguous',
    retryEnvelope: { kind: 'message', chatId: '101', text: 'private message' },
  };

  const setup = () => {
    const values = new Map<string, unknown>([[deliveryKey, state]]);
    const order: string[] = [];
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        order.push(`set:${key}`);
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const enqueue = vi.fn(async (_payload: unknown, jobId: string) => {
      order.push(`enqueue:${jobId}`);
    });
    return { values, order, store, enqueue };
  };

  it('inspects only opaque state metadata and never returns the retry envelope', async () => {
    const { store } = setup();
    const result = await inspectTelegramDelivery({
      deliveryKey,
      store,
    });
    expect(result).toEqual({
      deliveryKey,
      status: 'unknown',
      createdAt: '2026-09-09T21:59:59.000Z',
      updatedAt: unknownAt,
      unknownAt,
      attempts: 1,
      resetCount: 0,
      lastReasonCode: 'provider_ambiguous',
    });
    expect(JSON.stringify(result)).not.toContain('101');
    expect(JSON.stringify(result)).not.toContain('private message');
  });

  it('writes an append-only audit before one deterministic retry enqueue', async () => {
    const { values, order, store, enqueue } = setup();
    await expect(
      requestTelegramDeliveryReset({
        deliveryKey,
        expectedUnknownAt: unknownAt,
        requestId: '11111111-1111-4111-8111-111111111111',
        actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
        confirmation: 'RESET_UNKNOWN_TELEGRAM_DELIVERY',
        reason: 'Operator confirmed the recipient did not receive it',
        store,
        enqueue,
        now: () => new Date('2026-09-09T22:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'retry_enqueued' });
    expect(order[0]).toMatch(/^set:telegram:delivery-audit:/);
    expect(order[1]).toMatch(/^enqueue:telegram-delivery-retry-/);
    const audit = [...values.entries()].find(([key]) =>
      key.startsWith('telegram:delivery-audit:'),
    )?.[1];
    expect(audit).toMatchObject({
      deliveryKey,
      expectedUnknownAt: unknownAt,
      action: 'reset_requested',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects stale, replayed, or weak reset requests without enqueue', async () => {
    const { values, store, enqueue } = setup();
    const base = {
      deliveryKey,
      expectedUnknownAt: unknownAt,
      requestId: '11111111-1111-4111-8111-111111111111',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      confirmation: 'RESET_UNKNOWN_TELEGRAM_DELIVERY',
      reason: 'Operator confirmed the recipient did not receive it',
      store,
      enqueue,
      now: () => new Date(),
    };
    await expect(
      requestTelegramDeliveryReset({
        ...base,
        expectedUnknownAt: '2026-09-09T21:00:00.000Z',
      }),
    ).rejects.toThrow(/stale/i);
    await expect(
      requestTelegramDeliveryReset({
        ...base,
        confirmation: 'yes',
      }),
    ).rejects.toThrow(/confirmation/i);
    values.set(deliveryKey, { ...state, status: 'complete' });
    await expect(
      requestTelegramDeliveryReset(base),
    ).rejects.toThrow(/unknown|replay/i);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
