import { describe, expect, it, vi } from 'vitest';

import { handleTelegramUpdateJob } from 'src/modules/telegram/telegram-update-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('Telegram update worker durable replies', () => {
  it('does not parse or touch state, CRM, or Telegram while disabled', async () => {
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const processCommand = vi.fn();
    const createCrmClient = vi.fn();
    const createTelegramClient = vi.fn();
    await expect(
      handleTelegramUpdateJob(
        { invalid: true },
        { workspaceId: WORKSPACE_ID } as never,
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'false',
          store,
          processCommand,
          createCrmClient,
          createTelegramClient,
        } as never,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(processCommand).not.toHaveBeenCalled();
    expect(createCrmClient).not.toHaveBeenCalled();
    expect(createTelegramClient).not.toHaveBeenCalled();
  });

  it('routes every message and callback response through durable delivery state', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const processCommand = vi.fn(async (_update, dependencies) => {
      await dependencies.answerCallback?.('callback-1');
      await dependencies.send('101', 'first');
      await dependencies.send('101', 'second');
      return { status: 'help' } as const;
    });
    const deliveryRecords = new Map<string, Record<string, unknown>>();
    const coreClient = {
      mutation: vi.fn(async (selection: Record<string, any>) => {
        if (selection.createTelegramDelivery) {
          const data = selection.createTelegramDelivery.__args.data;
          if (deliveryRecords.has(data.deliveryKey)) throw new Error('duplicate');
          const record = {
            ...data,
            createdAt: '2026-09-09T22:00:00.000Z',
            updatedAt: '2026-09-09T22:00:00.000Z',
          };
          deliveryRecords.set(data.deliveryKey, record);
          return { createTelegramDelivery: record };
        }
        const { data, filter } =
          selection.updateTelegramDeliveries.__args;
        const [id, status, stateToken] = filter.and.map(
          (part: Record<string, any>) => Object.values(part)[0].eq,
        );
        const record = [...deliveryRecords.values()].find(
          (candidate) =>
            candidate.id === id &&
            candidate.status === status &&
            candidate.stateToken === stateToken,
        );
        if (!record) return { updateTelegramDeliveries: [] };
        Object.assign(record, data);
        return { updateTelegramDeliveries: [record] };
      }),
      query: vi.fn(async (selection: Record<string, any>) => {
        const key = selection.telegramDeliveries.__args.filter.deliveryKey.eq;
        const record = deliveryRecords.get(key);
        return {
          telegramDeliveries: { edges: record ? [{ node: record }] : [] },
        };
      }),
    };

    await expect(
      handleTelegramUpdateJob(
        {
          updateId: 42,
          userId: '101',
          chatId: '101',
          firstName: 'Nash',
          text: '/help',
          callbackQueryId: 'callback-1',
          messageTimestamp: '2026-09-09T22:00:00.000Z',
        },
        {
          workspaceId: WORKSPACE_ID,
          workspaceMemberId: null,
          userWorkspaceId: null,
          retryCount: 0,
          maxRetries: 5,
        },
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'true',
          store,
          processCommand: processCommand as never,
          createCrmClient: vi.fn(() => coreClient as never),
          createTelegramClient: vi.fn(
            () => ({ sendMessage, answerCallbackQuery }) as never,
          ),
          timeZone: 'America/Chicago',
          linkCodesJson: '{}',
        },
      ),
    ).resolves.toEqual({ status: 'help' });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(answerCallbackQuery).toHaveBeenCalledOnce();
    expect(deliveryRecords).toHaveLength(3);
    expect([...deliveryRecords.values()].every((value) =>
      value.status === 'complete')).toBe(true);
  });
});
