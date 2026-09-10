import { describe, expect, it, vi } from 'vitest';

import * as logicModule from 'src/modules/telegram/telegram-delivery-control.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

describe('Telegram delivery control route', () => {
  it.each([
    ['wrong workspace', '33333333-3333-4333-8333-333333333333', 'operator-secret'],
    ['wrong operator proof', WORKSPACE_ID, 'wrong-secret'],
  ])('rejects %s before reading delivery state', async (_label, workspaceId, proof) => {
    expect(typeof logicModule.handleTelegramDeliveryControl).toBe('function');
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const enqueue = vi.fn();
    await expect(
      logicModule.handleTelegramDeliveryControl?.(
        {
          headers: { 'x-corgi-telegram-operator-secret': proof },
          body: { action: 'inspect', deliveryKey: `telegram:delivery:${'a'.repeat(64)}` },
        } as never,
        {
          workspaceId,
          workspaceMemberId: MEMBER_ID,
          userWorkspaceId: 'user-workspace-1',
          retryCount: 0,
          maxRetries: 0,
        },
        {
          expectedWorkspaceId: WORKSPACE_ID,
          operatorSecret: 'operator-secret',
          store,
          enqueue,
        },
      ),
    ).rejects.toThrow(/workspace|operator|unauthorized/i);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('requires Twenty authentication plus a forwarded constant-time operator header', () => {
    expect(logicModule.default?.success).toBe(true);
    expect(logicModule.default?.config.httpRouteTriggerSettings).toEqual({
      path: '/telegram/delivery-control',
      httpMethod: 'POST',
      isAuthRequired: true,
      forwardedRequestHeaders: ['x-corgi-telegram-operator-secret'],
    });
  });

  it('authenticates the operator but does not inspect or enqueue while disabled', async () => {
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const enqueue = vi.fn();
    await expect(
      logicModule.handleTelegramDeliveryControl(
        {
          headers: { 'x-corgi-telegram-operator-secret': 'operator-secret' },
          body: { action: 'inspect', deliveryKey: `telegram:delivery:${'a'.repeat(64)}` },
        } as never,
        {
          workspaceId: WORKSPACE_ID,
          workspaceMemberId: MEMBER_ID,
          userWorkspaceId: 'user-workspace-1',
          retryCount: 0,
          maxRetries: 0,
        },
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'false',
          operatorSecret: 'operator-secret',
          store,
          enqueue,
        },
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
