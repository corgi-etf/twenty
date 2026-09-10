import { describe, expect, it, vi } from 'vitest';

import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';

const delivery = {
  id: 'de16fe62-e2a7-5244-aab4-d242abc01b20',
  deliveryKey: `telegram:delivery:${'a'.repeat(64)}`,
  operationDigest: 'b'.repeat(64),
  status: 'intent' as const,
  stateToken: 'token-1',
  attempts: 1,
  resetCount: 0,
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

describe('CoreTelegramDeliveryRepository', () => {
  it('uses deterministic create as the authoritative atomic claim and validates collisions', async () => {
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ createTelegramDelivery: delivery })
      .mockRejectedValueOnce(new Error('DUPLICATE_ENTRY_DETECTED'));
    const query = vi.fn().mockResolvedValue({
      telegramDeliveries: { edges: [{ node: delivery }] },
    });
    const repository = new CoreTelegramDeliveryRepository({
      mutation,
      query,
    } as never);

    const [first, second] = await Promise.all([
      repository.claim(delivery),
      repository.claim(delivery),
    ]);

    expect([first.acquired, second.acquired].sort()).toEqual([false, true]);
    expect(mutation).toHaveBeenCalledTimes(2);

    query.mockResolvedValueOnce({
      telegramDeliveries: {
        edges: [{ node: { ...delivery, operationDigest: 'c'.repeat(64) } }],
      },
    });
    await expect(repository.claim(delivery)).rejects.toThrow(/collision/i);
  });

  it('fails closed when a rejected create cannot be confirmed', async () => {
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockRejectedValue(new Error('network failure')),
      query: vi.fn().mockResolvedValue({
        telegramDeliveries: { edges: [] },
      }),
    } as never);

    await expect(repository.claim(delivery)).rejects.toThrow(/confirm/i);
  });

  it('performs compare-and-set transitions with all expected fields', async () => {
    const mutation = vi.fn().mockResolvedValue({
      updateTelegramDeliveries: [{ ...delivery, status: 'complete' }],
    });
    const repository = new CoreTelegramDeliveryRepository({
      mutation,
      query: vi.fn(),
    } as never);

    await expect(
      repository.transition({
        id: delivery.id,
        expectedStatus: 'intent',
        expectedStateToken: 'token-1',
        patch: { status: 'complete', stateToken: 'token-2' },
      }),
    ).resolves.toBe(true);
    expect(mutation.mock.calls[0]?.[0].updateTelegramDeliveries.__args.filter)
      .toEqual({
        and: [
          { id: { eq: delivery.id } },
          { status: { eq: 'intent' } },
          { stateToken: { eq: 'token-1' } },
        ],
      });
  });

  it('atomically rejects a second reset grant for the same unknown generation', async () => {
    const audit = {
      id: '38d0e91a-0f05-558f-a3ba-8f83e61d822c',
      requestId: '11111111-1111-4111-8111-111111111111',
      deliveryKey: delivery.deliveryKey,
      expectedUnknownAt: '2026-09-09T12:01:00.000Z',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      reasonDigest: 'd'.repeat(64),
      requestedAt: '2026-09-09T12:02:00.000Z',
    };
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ createTelegramDeliveryAudit: audit })
      .mockRejectedValueOnce(new Error('DUPLICATE_ENTRY_DETECTED'));
    const query = vi.fn().mockResolvedValue({
      telegramDeliveryAudits: { edges: [{ node: audit }] },
    });
    const repository = new CoreTelegramDeliveryRepository({
      mutation,
      query,
    } as never);

    await expect(repository.recordResetAudit(audit)).resolves.toEqual({
      acquired: true,
      record: audit,
    });
    await expect(repository.recordResetAudit(audit)).resolves.toEqual({
      acquired: false,
      record: audit,
    });
  });
});
