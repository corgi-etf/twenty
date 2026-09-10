import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';
import * as workerModule from 'src/modules/telegram/telegram-delivery-retry-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const deliveryKey = `telegram:delivery:${'e'.repeat(64)}`;
const unknownAt = '2026-09-09T22:00:00.000Z';
const requestId = '11111111-1111-4111-8111-111111111111';
const retryEnvelope = { kind: 'message', chatId: '101', text: 'retry me' } as const;
const envelopeKey = `telegram:delivery-envelope:${'e'.repeat(64)}`;

const audit = {
  id: '77777777-7777-4777-8777-777777777777',
  deliveryKey,
  expectedUnknownAt: unknownAt,
  requestId,
  actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
  reasonDigest: 'a'.repeat(64),
  requestedAt: '2026-09-09T22:01:00.000Z',
};

const initialState = {
  id: '99999999-9999-4999-8999-999999999999',
  deliveryKey,
  operationDigest: createHash('sha256')
    .update(JSON.stringify(retryEnvelope))
    .digest('hex'),
  stateToken: 'state-1',
  status: 'unknown',
  createdAt: unknownAt,
  updatedAt: unknownAt,
  unknownAt,
  attempts: 1,
  resetCount: 0,
};

const makeRepository = (
  values: Map<string, any>,
  fail?: 'audit' | 'approval' | 'intent' | 'complete',
) => {
  let failed = false;
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    getAudit: vi.fn(async (id: string) => {
      if (fail === 'audit') throw new Error('audit read failed');
      return values.get(`telegram:delivery-audit:${id}`) ?? null;
    }),
    claim: vi.fn(async (record: any) => {
      const existing = values.get(record.deliveryKey);
      return existing
        ? { acquired: false, record: existing }
        : (values.set(record.deliveryKey, record), { acquired: true, record });
    }),
    transition: vi.fn(async ({ id, expectedStatus, expectedStateToken, patch }: any) => {
      const record = [...values.values()].find((value) =>
        value?.id === id && value.status === expectedStatus &&
        value.stateToken === expectedStateToken,
      );
      const target = patch.status;
      if (
        !failed &&
        (fail === target || (fail === 'approval' && target === 'retry_approved'))
      ) {
        failed = true;
        throw new Error(`${target} write failed`);
      }
      if (!record) return false;
      values.set(record.deliveryKey, { ...record, ...patch });
      return true;
    }),
  };
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
          repository: { getAudit: vi.fn(), get: vi.fn(), claim: vi.fn(), transition: vi.fn() } as never,
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
          repository: { getAudit: vi.fn(), get: vi.fn(), claim: vi.fn(), transition: vi.fn() } as never,
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
      [envelopeKey, retryEnvelope],
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
          repository: makeRepository(values) as never,
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
          repository: makeRepository(values) as never,
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
        [envelopeKey, retryEnvelope],
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
            repository: makeRepository(values) as never,
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
      [envelopeKey, retryEnvelope],
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
      repository: makeRepository(values) as never,
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
      repository: makeRepository(values) as never,
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
      [envelopeKey, retryEnvelope],
    ]);
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => values.set(key, value)),
      delete: vi.fn(),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const alerts: unknown[] = [];
    const dependencies = {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'true',
      store,
      repository: makeRepository(values, 'complete') as never,
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
    ).resolves.toEqual({ status: 'unknown' });
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
        [envelopeKey, retryEnvelope],
      ]);
      const store = {
        get: vi.fn(async (key: string) => {
          if (failure === 'audit' && key.includes('delivery-audit')) {
            throw new Error('audit read failed');
          }
          return values.get(key) ?? null;
        }),
        set: vi.fn(async (key: string, value: unknown) => values.set(key, value)),
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
            repository: makeRepository(values, failure) as never,
            createTelegramClient,
          },
        ),
      ).rejects.toThrow(/failed/);
      expect(createTelegramClient).not.toHaveBeenCalled();
    }
  });
});
