import { describe, expect, it, vi } from 'vitest';

import {
  inspectTelegramDelivery,
  requestTelegramDeliveryReset,
} from 'src/modules/telegram/services/telegram-delivery-control.service';

describe('Telegram unknown-delivery control', () => {
  const deliveryKey = `telegram:delivery:${'d'.repeat(64)}`;
  const unknownAt = '2026-09-09T22:00:00.000Z';
  const state = {
    id: '99999999-9999-4999-8999-999999999999',
    deliveryKey,
    operationDigest: 'a'.repeat(64),
    stateToken: 'state-1',
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
    const audits = new Map<string, unknown>();
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
    const repository = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      recordResetAudit: vi.fn(async (audit: { requestId: string }) => {
        order.push(`audit:${audit.requestId}`);
        const existing = audits.get(audit.requestId);
        if (!existing) audits.set(audit.requestId, audit);
        return { acquired: !existing, record: existing ?? audit };
      }),
    };
    return { values, audits, order, store, repository, enqueue };
  };

  it('inspects only opaque state metadata and never returns the retry envelope', async () => {
    const { repository } = setup();
    const result = await inspectTelegramDelivery({
      deliveryKey,
      repository: repository as never,
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
    const { audits, order, repository, enqueue } = setup();
    await expect(
      requestTelegramDeliveryReset({
        deliveryKey,
        expectedUnknownAt: unknownAt,
        requestId: '11111111-1111-4111-8111-111111111111',
        actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
        confirmation: 'RESET_UNKNOWN_TELEGRAM_DELIVERY',
        reason: 'Operator confirmed the recipient did not receive it',
        repository: repository as never,
        enqueue,
        now: () => new Date('2026-09-09T22:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'retry_enqueued' });
    expect(order[0]).toMatch(/^audit:/);
    expect(order[1]).toMatch(/^enqueue:telegram-delivery-retry-/);
    const audit = [...audits.values()][0];
    expect(audit).toMatchObject({
      deliveryKey,
      expectedUnknownAt: unknownAt,
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects stale, replayed, or weak reset requests without enqueue', async () => {
    const { values, repository, enqueue } = setup();
    const base = {
      deliveryKey,
      expectedUnknownAt: unknownAt,
      requestId: '11111111-1111-4111-8111-111111111111',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      confirmation: 'RESET_UNKNOWN_TELEGRAM_DELIVERY',
      reason: 'Operator confirmed the recipient did not receive it',
      repository: repository as never,
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

  it('never enqueues without a durable audit and safely resumes after enqueue failure', async () => {
    const request = {
      deliveryKey,
      expectedUnknownAt: unknownAt,
      requestId: '11111111-1111-4111-8111-111111111111',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      confirmation: 'RESET_UNKNOWN_TELEGRAM_DELIVERY',
      reason: 'Operator confirmed the recipient did not receive it',
      now: () => new Date('2026-09-09T22:10:00.000Z'),
    };
    const auditFailure = setup();
    auditFailure.repository.recordResetAudit.mockRejectedValueOnce(
      new Error('audit write failed'),
    );
    await expect(
      requestTelegramDeliveryReset({
        ...request,
        repository: auditFailure.repository as never,
        enqueue: auditFailure.enqueue,
      }),
    ).rejects.toThrow(/audit write failed/i);
    expect(auditFailure.enqueue).not.toHaveBeenCalled();

    const enqueueFailure = setup();
    enqueueFailure.enqueue.mockRejectedValueOnce(
      new Error('enqueue response lost'),
    );
    const input = {
      ...request,
      repository: enqueueFailure.repository as never,
      enqueue: enqueueFailure.enqueue,
    };
    await expect(requestTelegramDeliveryReset(input)).rejects.toThrow(
      /enqueue response lost/i,
    );
    await expect(requestTelegramDeliveryReset(input)).resolves.toMatchObject({
      status: 'retry_enqueued',
    });
    expect(enqueueFailure.enqueue.mock.calls[0]?.[1]).toBe(
      enqueueFailure.enqueue.mock.calls[1]?.[1],
    );
    expect(
      [...enqueueFailure.audits.keys()],
    ).toHaveLength(1);
  });
});
