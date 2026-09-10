import { describe, expect, it, vi } from 'vitest';

import { handleTelegramUpdateJob } from 'src/modules/telegram/telegram-update-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_CHAT_ID = '-1002394851554';
const GROUP_THREAD_ID = 304311;
const GROUP_TOPICS_JSON = JSON.stringify({
  version: 1,
  topics: [{ chatId: GROUP_CHAT_ID, messageThreadId: GROUP_THREAD_ID }],
});

const context = {
  workspaceId: WORKSPACE_ID,
  workspaceMemberId: null,
  userWorkspaceId: null,
  retryCount: 0,
  maxRetries: 5,
} as never;

const harness = () => {
  const values = new Map<string, unknown>();
  const store = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(),
  };
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
      const { data, filter } = selection.updateTelegramDeliveries.__args;
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
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
  const dependencies = (
    processCommand: unknown,
    groupTopicsJson?: string,
  ) => ({
    expectedWorkspaceId: WORKSPACE_ID,
    enabled: 'true',
    store,
    processCommand: processCommand as never,
    createCrmClient: vi.fn(() => coreClient as never),
    createRawCrmTransport: vi.fn(() => ({ request: vi.fn() }) as never),
    createTelegramClient: vi.fn(
      () => ({ sendMessage, answerCallbackQuery }) as never,
    ),
    timeZone: 'America/Chicago',
    publicReportsEnabled: 'true',
    linkCodesJson: '{}',
    groupTopicsJson,
  });
  return {
    values,
    store,
    deliveryRecords,
    coreClient,
    sendMessage,
    answerCallbackQuery,
    dependencies,
  };
};

describe('Telegram update worker durable replies', () => {
  it('does not parse or touch state, CRM, or Telegram while disabled', async () => {
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const processCommand = vi.fn();
    const createCrmClient = vi.fn();
    const createRawCrmTransport = vi.fn();
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
          createRawCrmTransport,
          createTelegramClient,
        } as never,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(processCommand).not.toHaveBeenCalled();
    expect(createCrmClient).not.toHaveBeenCalled();
    expect(createRawCrmTransport).not.toHaveBeenCalled();
    expect(createTelegramClient).not.toHaveBeenCalled();
  });

  it('routes every message and callback response through durable delivery state', async () => {
    const test = harness();
    const processCommand = vi.fn(async (_update, dependencies) => {
      expect(dependencies.publicReportsEnabled).toBe('true');
      await dependencies.answerCallback?.('callback-1');
      await dependencies.send('101', 'first');
      await dependencies.send('101', 'second');
      return { status: 'help' } as const;
    });

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
        context,
        test.dependencies(processCommand),
      ),
    ).resolves.toEqual({ status: 'help' });
    expect(test.sendMessage).toHaveBeenCalledTimes(2);
    // A private reply must stay thread-less; Telegram rejects a thread that
    // does not belong to the chat.
    expect(test.sendMessage).toHaveBeenNthCalledWith(1, '101', 'first', undefined);
    expect(processCommand.mock.calls[0]?.[1].now().toISOString()).toBe(
      '2026-09-09T22:00:00.000Z',
    );
    expect(test.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(test.deliveryRecords).toHaveLength(3);
    expect([...test.deliveryRecords.values()].every((value) =>
      value.status === 'COMPLETE')).toBe(true);
  });

  it('answers an allowlisted group topic inside that same topic', async () => {
    const test = harness();
    const processCommand = vi.fn(async (update, dependencies) => {
      expect(update.chatScope).toBe('group_topic');
      await dependencies.send(GROUP_CHAT_ID, 'report');
      return { status: 'report' } as const;
    });

    await expect(
      handleTelegramUpdateJob(
        {
          updateId: 43,
          userId: '101',
          chatId: GROUP_CHAT_ID,
          firstName: 'Nash',
          text: '/daily',
          messageTimestamp: '2026-09-09T22:00:00.000Z',
          chatScope: 'group_topic',
          messageThreadId: GROUP_THREAD_ID,
        },
        context,
        test.dependencies(processCommand, GROUP_TOPICS_JSON),
      ),
    ).resolves.toEqual({ status: 'report' });
    expect(test.sendMessage).toHaveBeenCalledWith(
      GROUP_CHAT_ID,
      'report',
      GROUP_THREAD_ID,
    );
  });

  it.each([
    ['the allowlist no longer holds the group', undefined],
    [
      'the allowlist holds a different topic in that group',
      JSON.stringify({
        version: 1,
        topics: [{ chatId: GROUP_CHAT_ID, messageThreadId: GROUP_THREAD_ID + 1 }],
      }),
    ],
  ])('refuses a queued group update when %s', async (_label, groupTopicsJson) => {
    const test = harness();
    const processCommand = vi.fn();

    await expect(
      handleTelegramUpdateJob(
        {
          updateId: 44,
          userId: '101',
          chatId: GROUP_CHAT_ID,
          firstName: 'Nash',
          text: '/daily',
          messageTimestamp: '2026-09-09T22:00:00.000Z',
          chatScope: 'group_topic',
          messageThreadId: GROUP_THREAD_ID,
        },
        context,
        test.dependencies(processCommand, groupTopicsJson),
      ),
    ).resolves.toEqual({ status: 'untrusted-group-topic' });
    expect(processCommand).not.toHaveBeenCalled();
    expect(test.sendMessage).not.toHaveBeenCalled();
    expect(test.store.set).not.toHaveBeenCalled();
  });
});
