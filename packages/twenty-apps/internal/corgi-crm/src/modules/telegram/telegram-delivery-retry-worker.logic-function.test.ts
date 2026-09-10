import { describe, expect, it, vi } from 'vitest';

import * as workerModule from 'src/modules/telegram/telegram-delivery-retry-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const deliveryKey = `telegram:delivery:${'e'.repeat(64)}`;
const unknownAt = '2026-09-09T22:00:00.000Z';
const requestId = '11111111-1111-4111-8111-111111111111';

describe('Telegram delivery retry worker', () => {
  it('does not parse, read state, or construct a provider while disabled', async () => {
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const createTelegramClient = vi.fn();
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { invalid: true },
        { workspaceId: WORKSPACE_ID } as never,
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'false',
          store,
          createTelegramClient,
        },
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(createTelegramClient).not.toHaveBeenCalled();
  });

  it('requires workspace context before KV or provider construction', async () => {
    expect(typeof workerModule.handleTelegramDeliveryRetryJob).toBe('function');
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const createTelegramClient = vi.fn();
    await expect(
      workerModule.handleTelegramDeliveryRetryJob?.(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        {
          workspaceId: '22222222-2222-4222-8222-222222222222',
          workspaceMemberId: null,
          userWorkspaceId: null,
          retryCount: 0,
          maxRetries: 5,
        },
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'true',
          store,
          createTelegramClient,
        },
      ),
    ).rejects.toThrow(/workspace/i);
    expect(store.get).not.toHaveBeenCalled();
    expect(createTelegramClient).not.toHaveBeenCalled();
  });

  it('uses the exact audited unknown version and completes one approved retry', async () => {
    expect(typeof workerModule.handleTelegramDeliveryRetryJob).toBe('function');
    const values = new Map<string, unknown>([
      [
        deliveryKey,
        {
          status: 'unknown',
          createdAt: unknownAt,
          updatedAt: unknownAt,
          unknownAt,
          attempts: 1,
          resetCount: 0,
          retryEnvelope: { kind: 'message', chatId: '101', text: 'retry me' },
        },
      ],
      [
        `telegram:delivery-audit:${requestId}`,
        {
          action: 'reset_requested',
          deliveryKey,
          expectedUnknownAt: unknownAt,
          requestId,
        },
      ],
    ]);
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    await expect(
      workerModule.handleTelegramDeliveryRetryJob?.(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
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
          createTelegramClient: () => ({
            sendMessage,
            answerCallbackQuery: vi.fn(),
          }),
        },
      ),
    ).resolves.toEqual({ status: 'complete' });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(values.get(deliveryKey)).toMatchObject({
      status: 'complete',
      resetCount: 1,
    });

    await expect(
      workerModule.handleTelegramDeliveryRetryJob?.(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        {
          workspaceId: WORKSPACE_ID,
          workspaceMemberId: null,
          userWorkspaceId: null,
          retryCount: 1,
          maxRetries: 5,
        },
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'true',
          store,
          createTelegramClient: () => ({
            sendMessage,
            answerCallbackQuery: vi.fn(),
          }),
        },
      ),
    ).rejects.toThrow(/stale|replay|unknown/i);
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
