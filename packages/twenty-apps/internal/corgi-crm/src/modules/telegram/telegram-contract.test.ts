import { describe, expect, it, vi } from 'vitest';

import application from 'src/application-config';
import dailySummary from 'src/modules/telegram/telegram-daily-summary.logic-function';
import dailySummaryWorker from 'src/modules/telegram/telegram-daily-summary-worker.logic-function';
import updateWorker from 'src/modules/telegram/telegram-update-worker.logic-function';
import webhook from 'src/modules/telegram/telegram-webhook.logic-function';
import * as webhookModule from 'src/modules/telegram/telegram-webhook.logic-function';
import * as workerModule from 'src/modules/telegram/telegram-update-worker.logic-function';
import * as dailyModule from 'src/modules/telegram/telegram-daily-summary.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('Telegram application contract', () => {
  it('declares secrets without embedding values and requires explicit schedule config', () => {
    const variables = application.config.applicationVariables!;
    for (const key of [
      'CORGI_CRM_TELEGRAM_BOT_TOKEN',
      'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET',
      'CORGI_CRM_TELEGRAM_LINK_CODES',
    ]) {
      expect(variables[key]).toMatchObject({ isSecret: true });
      expect(variables[key]).not.toHaveProperty('value');
    }
    expect(variables.CORGI_CRM_TELEGRAM_ENABLED).toMatchObject({
      isSecret: false,
      value: 'false',
    });
    expect(variables.CORGI_CRM_WORKSPACE_ID).not.toHaveProperty('value');
    for (const key of [
      'CORGI_CRM_TELEGRAM_TIME_ZONE',
      'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME',
    ]) {
      expect(variables[key]).toMatchObject({ isSecret: false });
      expect(variables[key]).not.toHaveProperty('value');
    }
  });

  it('rejects a mismatched webhook workspace before KV or queue access', async () => {
    const handle = (
      webhookModule as unknown as {
        handleTelegramWebhook?: (...args: unknown[]) => Promise<unknown>;
      }
    ).handleTelegramWebhook;
    expect(typeof handle).toBe('function');
    if (!handle) return;
    const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const enqueue = vi.fn();
    await expect(
      handle(
        {
          headers: { 'x-telegram-bot-api-secret-token': 'secret' },
          body: {},
        } as never,
        {
          workspaceId: OTHER_WORKSPACE_ID,
          retryCount: 0,
          maxRetries: 0,
          userWorkspaceId: null,
          workspaceMemberId: null,
        } as never,
        {
          expectedWorkspaceId: WORKSPACE_ID,
          webhookSecret: 'secret',
          store,
          enqueue,
        } as never,
      ),
    ).rejects.toThrow(/workspace/i);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a mismatched update-worker workspace before every dependency', async () => {
    const handle = (
      workerModule as unknown as {
        handleTelegramUpdateJob?: (...args: unknown[]) => Promise<unknown>;
      }
    ).handleTelegramUpdateJob;
    expect(typeof handle).toBe('function');
    if (!handle) return;
    const dependencies = {
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      processCommand: vi.fn(),
      createCrmClient: vi.fn(),
      createTelegramClient: vi.fn(),
    };
    await expect(
      handle(
        {
          updateId: 42,
          userId: '101',
          chatId: '101',
          firstName: 'Nash',
          text: '/today',
          messageTimestamp: '2026-09-09T22:00:00.000Z',
        } as never,
        {
          workspaceId: OTHER_WORKSPACE_ID,
          retryCount: 0,
          maxRetries: 5,
          userWorkspaceId: null,
          workspaceMemberId: null,
        } as never,
        { expectedWorkspaceId: WORKSPACE_ID, ...dependencies } as never,
      ),
    ).rejects.toThrow(/workspace/i);
    expect(dependencies.store.get).not.toHaveBeenCalled();
    expect(dependencies.store.set).not.toHaveBeenCalled();
    expect(dependencies.processCommand).not.toHaveBeenCalled();
    expect(dependencies.createCrmClient).not.toHaveBeenCalled();
    expect(dependencies.createTelegramClient).not.toHaveBeenCalled();
  });

  it('does not load roster or enqueue when Telegram is disabled', async () => {
    const handle = (
      dailyModule as unknown as {
        handleTelegramDailySummary?: (...args: unknown[]) => Promise<unknown>;
      }
    ).handleTelegramDailySummary;
    expect(typeof handle).toBe('function');
    if (!handle) return;
    const loadRoster = vi.fn();
    const enqueue = vi.fn();
    await expect(
      handle(
        {},
        {
          workspaceId: WORKSPACE_ID,
          retryCount: 0,
          maxRetries: 0,
          userWorkspaceId: null,
          workspaceMemberId: null,
        } as never,
        {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'false',
          loadRoster,
          enqueue,
        } as never,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(loadRoster).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps the Telegram webhook thin, open only to signed provider requests', () => {
    expect(webhook.success).toBe(true);
    expect(webhook.config.httpRouteTriggerSettings).toEqual({
      path: '/telegram/webhook',
      httpMethod: 'POST',
      isAuthRequired: false,
      forwardedRequestHeaders: ['x-telegram-bot-api-secret-token'],
    });
    expect(webhook.config.timeoutSeconds).toBe(15);
  });

  it('runs delivery every 15 minutes while the domain service owns local-time gating', () => {
    expect(dailySummary.success).toBe(true);
    expect(dailySummary.config.cronTriggerSettings).toEqual({
      pattern: '*/15 * * * *',
    });
    expect(updateWorker.success).toBe(true);
    expect(updateWorker.config).not.toHaveProperty('httpRouteTriggerSettings');
    expect(dailySummaryWorker.success).toBe(true);
    expect(dailySummaryWorker.config).not.toHaveProperty(
      'httpRouteTriggerSettings',
    );
    expect(dailySummaryWorker.config).not.toHaveProperty('cronTriggerSettings');
  });
});
