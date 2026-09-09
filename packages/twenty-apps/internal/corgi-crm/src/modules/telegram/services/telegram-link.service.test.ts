import { describe, expect, it, vi } from 'vitest';

import {
  linkTelegramAccount,
  parseTelegramLinkCodes,
} from 'src/modules/telegram/services/telegram-link.service';

describe('Telegram account linking', () => {
  it('resolves a configured one-time code without hard-coded user identities', async () => {
    expect(
      parseTelegramLinkCodes(
        JSON.stringify({ 'one-time-code': 'workspace-member-1' }),
      ),
    ).toEqual(new Map([['one-time-code', 'workspace-member-1']]));
  });

  it('links one unique wholesaler and adds it to the durable delivery roster', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => values.delete(key)),
    };

    await expect(
      linkTelegramAccount({
        code: 'one-time-code',
        userId: '101',
        chatId: '101',
        configuredCodes: new Map([['one-time-code', 'workspace-member-1']]),
        findWholesalers: vi
          .fn()
          .mockResolvedValue([{ id: 'wholesaler-1', name: 'Nash' }]),
        store,
      }),
    ).resolves.toEqual({
      wholesalerId: 'wholesaler-1',
      wholesalerName: 'Nash',
      userId: '101',
      chatId: '101',
    });

    expect(values.get('telegram:user:101')).toMatchObject({
      wholesalerId: 'wholesaler-1',
      chatId: '101',
    });
    expect(values.get('telegram:delivery-roster')).toEqual([
      expect.objectContaining({ wholesalerId: 'wholesaler-1', chatId: '101' }),
    ]);
    expect([...values.keys()].some((key) => key.includes('one-time-code'))).toBe(
      false,
    );
  });

  it('fails closed on an unknown code or ambiguous wholesaler identity', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const input = {
      userId: '101',
      chatId: '101',
      configuredCodes: new Map([['valid', 'workspace-member-1']]),
      store,
    };

    await expect(
      linkTelegramAccount({
        ...input,
        code: 'invalid',
        findWholesalers: vi.fn(),
      }),
    ).rejects.toThrow(/invalid link code/i);
    await expect(
      linkTelegramAccount({
        ...input,
        code: 'valid',
        findWholesalers: vi.fn().mockResolvedValue([
          { id: 'wholesaler-1', name: 'Nash' },
          { id: 'wholesaler-2', name: 'Nash duplicate' },
        ]),
      }),
    ).rejects.toThrow(/exactly one wholesaler/i);
    expect(store.set).not.toHaveBeenCalled();
  });
});
