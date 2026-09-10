import { describe, expect, it, vi } from 'vitest';

import { CoreTelegramDeliveryRepository } from './core-telegram-delivery.repository';

const intent = {
  id: 'de16fe62-e2a7-5244-aab4-d242abc01b20',
  deliveryKey: 'delivery-key',
  operationDigest: 'digest',
  status: 'intent' as const,
  stateToken: 'token-1',
  attempts: 1,
  resetCount: 0,
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

describe('Telegram delivery enum storage boundary', () => {
  it.each([
    ['READY', 'ready'],
    ['RETRY_APPROVED', 'retry_approved'],
    ['INTENT', 'intent'],
    ['UNKNOWN', 'unknown'],
    ['COMPLETE', 'complete'],
  ])('decodes the server state %s without changing its meaning', async (stored, domain) => {
    const repository = new CoreTelegramDeliveryRepository({ query: async () => ({
      telegramDeliveries: { edges: [{ node: { ...intent, status: stored } }] },
    }) } as never);
    expect(await repository.get(intent.deliveryKey)).toMatchObject({ status: domain });
  });

  it('writes uppercase GraphQL enums while retaining domain states', async () => {
    const mutation = vi.fn().mockResolvedValue({
      createTelegramDelivery: { ...intent, status: 'INTENT' },
    });
    const query = vi.fn().mockResolvedValue({
      telegramDeliveries: { edges: [{ node: { ...intent, status: 'INTENT' } }] },
    });
    const repository = new CoreTelegramDeliveryRepository({ mutation, query } as never);
    await expect(repository.claim(intent)).resolves.toEqual({
      acquired: true, record: intent,
    });
    expect(mutation.mock.calls[0]?.[0].createTelegramDelivery.__args.data.status)
      .toBe('INTENT');
  });

  it('maps both status and reason on reads and conditional updates', async () => {
    const query = vi.fn().mockResolvedValue({
      telegramDeliveries: { edges: [{ node: {
        ...intent, status: 'UNKNOWN', lastReasonCode: 'PROVIDER_AMBIGUOUS',
      } }] },
    });
    const mutation = vi.fn().mockResolvedValue({
      updateTelegramDeliveries: [{ id: intent.id, status: 'UNKNOWN', stateToken: 'token-2' }],
    });
    const repository = new CoreTelegramDeliveryRepository({ query, mutation } as never);
    expect(await repository.get(intent.deliveryKey)).toMatchObject({
      status: 'unknown', lastReasonCode: 'provider_ambiguous',
    });
    await expect(repository.transition({
      id: intent.id, expectedStatus: 'intent', expectedStateToken: intent.stateToken,
      patch: { status: 'unknown', stateToken: 'token-2', lastReasonCode: 'checkpoint_ambiguous' },
    })).resolves.toBe(true);
    const args = mutation.mock.calls[0]?.[0].updateTelegramDeliveries.__args;
    expect(args.data).toMatchObject({ status: 'UNKNOWN', lastReasonCode: 'CHECKPOINT_AMBIGUOUS' });
    expect(args.filter.and).toContainEqual({ status: { eq: 'INTENT' } });
  });

  it('rejects unsupported stored states instead of guessing a delivery state', async () => {
    const repository = new CoreTelegramDeliveryRepository({ query: async () => ({
      telegramDeliveries: { edges: [{ node: { ...intent, status: 'UNRECOGNIZED' } }] },
    }) } as never);
    await expect(repository.get(intent.deliveryKey)).rejects.toThrow(/status/i);
  });
});
