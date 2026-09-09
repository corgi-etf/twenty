import { describe, expect, it, vi } from 'vitest';

import {
  getValidatedTelegramDeliveryRoster,
  getValidatedTelegramLink,
  linkTelegramAccount,
  parseTelegramLinkBindings,
} from 'src/modules/telegram/services/telegram-link.service';

const MEMBER_1 = '11111111-1111-4111-8111-111111111111';
const MEMBER_2 = '22222222-2222-4222-8222-222222222222';

const memoryStore = () => {
  const values = new Map<string, unknown>();
  return {
    values,
    store: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => values.delete(key)),
    },
  };
};

const binding = (
  code = 'one-time-code',
  workspaceMemberId = MEMBER_1,
  telegramUserId = '101',
) => ({ code, workspaceMemberId, telegramUserId });

const identity = ({
  active = true,
  wholesalerId = 'wholesaler-1',
}: {
  active?: boolean;
  wholesalerId?: string;
} = {}) => ({
  findWorkspaceMember: vi.fn().mockResolvedValue({ id: MEMBER_1, active }),
  findWholesalers: vi.fn().mockResolvedValue([
    {
      id: wholesalerId,
      name: 'Nash',
      workspaceMemberId: MEMBER_1,
    },
  ]),
});

describe('Telegram account linking', () => {
  it('parses explicit Telegram-user-bound link bindings', () => {
    expect(
      parseTelegramLinkBindings(JSON.stringify({ bindings: [binding()] })),
    ).toEqual([binding()]);
  });

  it.each([
    ['code', [binding(), binding('one-time-code', MEMBER_2, '202')]],
    ['workspace member', [binding(), binding('second-code', MEMBER_1, '202')]],
    ['Telegram user', [binding(), binding('second-code', MEMBER_2, '101')]],
  ])('fails closed on duplicate %s bindings', (_label, bindings) => {
    expect(() =>
      parseTelegramLinkBindings(JSON.stringify({ bindings })),
    ).toThrow(/duplicate/i);
  });

  it('rejects a valid code presented by a different Telegram user', async () => {
    const { store } = memoryStore();

    await expect(
      linkTelegramAccount({
        code: 'one-time-code',
        userId: '999',
        chatId: '999',
        configuredBindings: [binding()],
        identity: identity(),
        store,
      }),
    ).rejects.toThrow(/invalid link code/i);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('retains the workspace member and writes one durable roster record per member', async () => {
    const { values, store } = memoryStore();

    await expect(
      linkTelegramAccount({
        code: 'one-time-code',
        userId: '101',
        chatId: '101',
        configuredBindings: [binding()],
        identity: identity(),
        store,
      }),
    ).resolves.toEqual({
      workspaceMemberId: MEMBER_1,
      wholesalerId: 'wholesaler-1',
      wholesalerName: 'Nash',
      userId: '101',
      chatId: '101',
    });

    expect(values.get(`telegram:member:${MEMBER_1}`)).toMatchObject({
      workspaceMemberId: MEMBER_1,
      userId: '101',
      wholesalerId: 'wholesaler-1',
    });
    expect(values.has('telegram:delivery-roster')).toBe(false);
    expect([...values.keys()].some((key) => key.includes('one-time-code'))).toBe(
      false,
    );
  });

  it('does not lose either roster record when independent links race', async () => {
    const { values, store } = memoryStore();
    const bindings = [binding(), binding('second-code', MEMBER_2, '202')];

    await Promise.all([
      linkTelegramAccount({
        code: 'one-time-code',
        userId: '101',
        chatId: '101',
        configuredBindings: bindings,
        identity: identity(),
        store,
      }),
      linkTelegramAccount({
        code: 'second-code',
        userId: '202',
        chatId: '202',
        configuredBindings: bindings,
        identity: {
          findWorkspaceMember: vi
            .fn()
            .mockResolvedValue({ id: MEMBER_2, active: true }),
          findWholesalers: vi.fn().mockResolvedValue([
            {
              id: 'wholesaler-2',
              name: 'Sam',
              workspaceMemberId: MEMBER_2,
            },
          ]),
        },
        store,
      }),
    ]);

    expect(values.get(`telegram:member:${MEMBER_1}`)).toMatchObject({
      userId: '101',
    });
    expect(values.get(`telegram:member:${MEMBER_2}`)).toMatchObject({
      userId: '202',
    });
  });

  it.each([
    ['deleted member', null, 'wholesaler-1'],
    ['deactivated member', { id: MEMBER_1, active: false }, 'wholesaler-1'],
    ['reassigned wholesaler', { id: MEMBER_1, active: true }, 'wholesaler-2'],
  ])('invalidates and removes a link for a %s', async (_label, member, wholesalerId) => {
    const { values, store } = memoryStore();
    const link = {
      workspaceMemberId: MEMBER_1,
      wholesalerId: 'wholesaler-1',
      wholesalerName: 'Nash',
      userId: '101',
      chatId: '101',
    };
    values.set('telegram:user:101', link);
    values.set(`telegram:member:${MEMBER_1}`, link);
    const crmIdentity = {
      findWorkspaceMember: vi.fn().mockResolvedValue(member),
      findWholesalers: vi.fn().mockResolvedValue([
        {
          id: wholesalerId,
          name: 'Current owner',
          workspaceMemberId: MEMBER_1,
        },
      ]),
    };

    await expect(
      getValidatedTelegramLink({ store, userId: '101', identity: crmIdentity }),
    ).resolves.toBeNull();
    expect(values.has('telegram:user:101')).toBe(false);
    expect(values.has(`telegram:member:${MEMBER_1}`)).toBe(false);
  });

  it('revalidates every configured member and excludes invalid scheduled recipients', async () => {
    const { values, store } = memoryStore();
    const valid = {
      workspaceMemberId: MEMBER_1,
      wholesalerId: 'wholesaler-1',
      wholesalerName: 'Nash',
      userId: '101',
      chatId: '101',
    };
    const invalid = {
      workspaceMemberId: MEMBER_2,
      wholesalerId: 'wholesaler-2',
      wholesalerName: 'Sam',
      userId: '202',
      chatId: '202',
    };
    values.set(`telegram:member:${MEMBER_1}`, valid);
    values.set(`telegram:member:${MEMBER_2}`, invalid);
    values.set('telegram:user:101', valid);
    values.set('telegram:user:202', invalid);
    const crmIdentity = {
      findWorkspaceMember: vi.fn(async (id: string) => ({
        id,
        active: id === MEMBER_1,
      })),
      findWholesalers: vi.fn(async (id: string) => [
        {
          id: id === MEMBER_1 ? 'wholesaler-1' : 'wholesaler-2',
          name: id === MEMBER_1 ? 'Nash' : 'Sam',
          workspaceMemberId: id,
        },
      ]),
    };

    await expect(
      getValidatedTelegramDeliveryRoster({
        store,
        configuredBindings: [binding(), binding('second-code', MEMBER_2, '202')],
        identity: crmIdentity,
      }),
    ).resolves.toEqual([valid]);
    expect(values.has(`telegram:member:${MEMBER_2}`)).toBe(false);
    expect(values.has('telegram:user:202')).toBe(false);
  });
});
