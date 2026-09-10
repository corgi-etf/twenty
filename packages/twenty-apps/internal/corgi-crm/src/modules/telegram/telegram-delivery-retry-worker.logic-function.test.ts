import { describe, expect, it, vi } from 'vitest';

import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';
import * as workerModule from 'src/modules/telegram/telegram-delivery-retry-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const deliveryKey = `telegram:delivery:${'e'.repeat(64)}`;
const unknownAt = '2026-09-09T22:00:00.000Z';
const requestId = '11111111-1111-4111-8111-111111111111';

const audit = {
  action: 'reset_requested',
  deliveryKey,
  expectedUnknownAt: unknownAt,
  requestId,
};

const initialState = {
  status: 'unknown',
  createdAt: unknownAt,
  updatedAt: unknownAt,
  unknownAt,
  attempts: 1,
  resetCount: 0,
  retryEnvelope: { kind: 'message', chatId: '101', text: 'retry me' },
};

const context = {
  workspaceId: WORKSPACE_ID,
  workspaceMemberId: null,
  userWorkspaceId: null,
  retryCount: 0,
  maxRetries: 5,
};

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
        initialState,
      ],
      [
        `telegram:delivery-audit:${requestId}`,
        audit,
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
        context,
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
        { ...context, retryCount: 1 },
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
  });

  it.each(['retry_approved', 'ready'] as const)(
    'resumes the exact audited retry from %s without incrementing reset count twice',
    async (status) => {
      const values = new Map<string, unknown>([
        [
          deliveryKey,
          {
            ...initialState,
            status,
            retryRequestId: requestId,
            approvedUnknownAt: unknownAt,
            resetCount: 1,
          },
        ],
        [`telegram:delivery-audit:${requestId}`, audit],
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
        workerModule.handleTelegramDeliveryRetryJob(
          { deliveryKey, expectedUnknownAt: unknownAt, requestId },
          context,
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
        retryRequestId: requestId,
      });
    },
  );

  it('retries an explicit provider rejection but never resends an ambiguous retry', async () => {
    const values = new Map<string, unknown>([
      [deliveryKey, initialState],
      [`telegram:delivery-audit:${requestId}`, audit],
    ]);
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new TelegramDeliveryError('explicit rejection', false),
      )
      .mockResolvedValueOnce(undefined);
    const dependencies = {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'true',
      store,
      createTelegramClient: () => ({
        sendMessage,
        answerCallbackQuery: vi.fn(),
      }),
    };
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        context,
        dependencies,
      ),
    ).rejects.toThrow(/rejection/i);
    expect(values.get(deliveryKey)).toMatchObject({
      status: 'ready',
      retryRequestId: requestId,
    });
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        { ...context, retryCount: 1 },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'complete' });
    expect(sendMessage).toHaveBeenCalledTimes(2);

    values.set(deliveryKey, initialState);
    const ambiguous = vi.fn().mockRejectedValue(
      new TelegramDeliveryError('ambiguous', true),
    );
    const ambiguousDependencies = {
      ...dependencies,
      createTelegramClient: () => ({
        sendMessage: ambiguous,
        answerCallbackQuery: vi.fn(),
      }),
    };
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        context,
        ambiguousDependencies,
      ),
    ).resolves.toEqual({ status: 'unknown' });
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        { ...context, retryCount: 1 },
        ambiguousDependencies,
      ),
    ).resolves.toEqual({ status: 'unknown' });
    expect(ambiguous).toHaveBeenCalledOnce();
  });

  it('turns a post-send checkpoint failure into observable unknown on worker retry', async () => {
    const values = new Map<string, unknown>([
      [deliveryKey, initialState],
      [`telegram:delivery-audit:${requestId}`, audit],
    ]);
    let deliveryWrites = 0;
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        if (key === deliveryKey) {
          deliveryWrites += 1;
          if (deliveryWrites === 3) throw new Error('complete checkpoint failed');
        }
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const alerts: unknown[] = [];
    const dependencies = {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'true',
      store,
      createTelegramClient: () => ({
        sendMessage,
        answerCallbackQuery: vi.fn(),
      }),
      onUnknown: (event: unknown) => alerts.push(event),
    };
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        context,
        dependencies,
      ),
    ).rejects.toThrow(/checkpoint/i);
    await expect(
      workerModule.handleTelegramDeliveryRetryJob(
        { deliveryKey, expectedUnknownAt: unknownAt, requestId },
        { ...context, retryCount: 1 },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'unknown' });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(values.get(deliveryKey)).toMatchObject({
      status: 'unknown',
      lastReasonCode: 'checkpoint_ambiguous',
      retryRequestId: requestId,
    });
    expect(alerts).toHaveLength(1);
  });

  it('never constructs the provider across audit, approval, or intent write failures', async () => {
    for (const failure of ['audit', 'approval', 'intent'] as const) {
      const values = new Map<string, unknown>([
        [deliveryKey, initialState],
        [`telegram:delivery-audit:${requestId}`, audit],
      ]);
      let deliveryWrites = 0;
      const store = {
        get: vi.fn(async (key: string) => {
          if (failure === 'audit' && key.includes('delivery-audit')) {
            throw new Error('audit read failed');
          }
          return values.get(key) ?? null;
        }),
        set: vi.fn(async (key: string, value: unknown) => {
          if (key === deliveryKey) {
            deliveryWrites += 1;
            if (
              (failure === 'approval' && deliveryWrites === 1) ||
              (failure === 'intent' && deliveryWrites === 2)
            ) {
              throw new Error(`${failure} write failed`);
            }
          }
          values.set(key, value);
        }),
        delete: vi.fn(),
      };
      const createTelegramClient = vi.fn();
      await expect(
        workerModule.handleTelegramDeliveryRetryJob(
          { deliveryKey, expectedUnknownAt: unknownAt, requestId },
          context,
          {
            expectedWorkspaceId: WORKSPACE_ID,
            enabled: 'true',
            store,
            createTelegramClient,
          },
        ),
      ).rejects.toThrow(/failed/);
      expect(createTelegramClient).not.toHaveBeenCalled();
    }
  });
});
