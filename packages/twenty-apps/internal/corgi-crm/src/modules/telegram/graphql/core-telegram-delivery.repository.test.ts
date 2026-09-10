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

const storedDelivery = { ...delivery, status: 'INTENT' };

describe('CoreTelegramDeliveryRepository', () => {
  it('uses deterministic create as the authoritative atomic claim and validates collisions', async () => {
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ createTelegramDelivery: storedDelivery })
      .mockRejectedValueOnce(new Error('DUPLICATE_ENTRY_DETECTED'));
    const query = vi.fn().mockResolvedValue({
      telegramDeliveries: { edges: [{ node: storedDelivery }] },
    });
    const repository = new CoreTelegramDeliveryRepository({
      mutation,
      query,
    } as never);

    const competing = { ...delivery, stateToken: 'token-2' };
    const [first, second] = await Promise.all([
      repository.claim(delivery),
      repository.claim(competing),
    ]);

    expect([first.acquired, second.acquired].sort()).toEqual([false, true]);
    expect(mutation).toHaveBeenCalledTimes(2);

    query.mockResolvedValueOnce({
      telegramDeliveries: {
        edges: [{ node: { ...storedDelivery, operationDigest: 'c'.repeat(64) } }],
      },
    });
    await expect(repository.claim(delivery)).rejects.toThrow(/collision/i);
  });

  it.each([
    null,
    { id: delivery.id },
    { ...storedDelivery, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { ...storedDelivery, operationDigest: 'c'.repeat(64) },
    { ...storedDelivery, status: 'COMPLETE' },
    { ...storedDelivery, stateToken: 'wrong-token' },
  ])('does not trust a malformed resolved create payload %#', async (created) => {
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockResolvedValue({ createTelegramDelivery: created }),
      query: vi.fn().mockResolvedValue({
        telegramDeliveries: { edges: [{ node: storedDelivery }] },
      }),
    } as never);

    await expect(repository.claim(delivery)).resolves.toEqual({
      acquired: true,
      record: delivery,
    });
  });

  it('treats a lost response after its own commit as acquired but a competing token as not acquired', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        telegramDeliveries: { edges: [{ node: storedDelivery }] },
      })
      .mockResolvedValueOnce({
        telegramDeliveries: {
          edges: [{ node: { ...storedDelivery, stateToken: 'competitor-token' } }],
        },
      });
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockRejectedValue(new Error('response lost')),
      query,
    } as never);

    await expect(repository.claim(delivery)).resolves.toMatchObject({
      acquired: true,
    });
    await expect(repository.claim(delivery)).resolves.toMatchObject({
      acquired: false,
    });
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
      updateTelegramDeliveries: [
        { ...storedDelivery, status: 'COMPLETE', stateToken: 'token-2' },
      ],
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
          { status: { eq: 'INTENT' } },
          { stateToken: { eq: 'token-1' } },
        ],
      });
  });

  it.each([
    null,
    [],
    [{ id: delivery.id }],
    [{ ...storedDelivery, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'COMPLETE', stateToken: 'token-2' }],
    [{ ...storedDelivery, status: 'READY', stateToken: 'token-2' }],
    [{ ...storedDelivery, status: 'COMPLETE', stateToken: 'wrong-token' }],
  ])('does not trust a malformed transition response %#', async (response) => {
    const persisted = { ...storedDelivery, status: 'COMPLETE', stateToken: 'token-2' };
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockResolvedValue({ updateTelegramDeliveries: response }),
      query: vi.fn().mockResolvedValue({
        telegramDeliveries: { edges: [{ node: persisted }] },
      }),
    } as never);
    await expect(
      repository.transition({
        id: delivery.id,
        expectedStatus: 'intent',
        expectedStateToken: 'token-1',
        patch: { status: 'complete', stateToken: 'token-2' },
      }),
    ).resolves.toBe(true);
  });

  it('fails a transition closed when readback has a competing fence', async () => {
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockRejectedValue(new Error('response lost')),
      query: vi.fn().mockResolvedValue({
        telegramDeliveries: {
          edges: [
            { node: { ...storedDelivery, status: 'COMPLETE', stateToken: 'competitor' } },
          ],
        },
      }),
    } as never);
    await expect(
      repository.transition({
        id: delivery.id,
        expectedStatus: 'intent',
        expectedStateToken: 'token-1',
        patch: { status: 'complete', stateToken: 'token-2' },
      }),
    ).resolves.toBe(false);
  });

  it('fails a transition closed when readback returns a wrong row with the target fence', async () => {
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockResolvedValue({ updateTelegramDeliveries: null }),
      query: vi.fn().mockResolvedValue({
        telegramDeliveries: {
          edges: [
            {
              node: {
                ...storedDelivery,
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                status: 'COMPLETE',
                stateToken: 'token-2',
              },
            },
          ],
        },
      }),
    } as never);
    await expect(
      repository.transition({
        id: delivery.id,
        expectedStatus: 'intent',
        expectedStateToken: 'token-1',
        patch: { status: 'complete', stateToken: 'token-2' },
      }),
    ).resolves.toBe(false);
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

  it('does not enqueue from a malformed reset-audit create response', async () => {
    const audit = {
      id: '38d0e91a-0f05-558f-a3ba-8f83e61d822c',
      requestId: '11111111-1111-4111-8111-111111111111',
      deliveryKey: delivery.deliveryKey,
      expectedUnknownAt: '2026-09-09T12:01:00.000Z',
      actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
      reasonDigest: 'd'.repeat(64),
      requestedAt: '2026-09-09T12:02:00.000Z',
    };
    const repository = new CoreTelegramDeliveryRepository({
      mutation: vi.fn().mockResolvedValue({ createTelegramDeliveryAudit: null }),
      query: vi.fn().mockResolvedValue({
        telegramDeliveryAudits: { edges: [] },
      }),
    } as never);
    await expect(repository.recordResetAudit(audit)).rejects.toThrow(/confirm/i);
  });
});
