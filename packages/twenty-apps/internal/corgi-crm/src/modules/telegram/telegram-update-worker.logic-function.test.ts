import { describe, expect, it, vi } from 'vitest';

import { handleTelegramUpdateJob } from 'src/modules/telegram/telegram-update-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('Telegram update worker durable replies', () => {
  it('routes every message and callback response through durable delivery state', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => values.set(key, value)),
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
          store,
          processCommand: processCommand as never,
          createCrmClient: vi.fn(() => ({}) as never),
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
    const deliveryStates = [...values.entries()].filter(([key]) =>
      key.startsWith('telegram:delivery:'),
    );
    expect(deliveryStates).toHaveLength(3);
    expect(deliveryStates.every(([, value]) =>
      (value as { status?: string }).status === 'complete')).toBe(true);
  });
});
