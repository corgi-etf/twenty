import { describe, expect, it } from 'vitest';

import application from 'src/application-config';
import dailySummary from 'src/modules/telegram/telegram-daily-summary.logic-function';
import updateWorker from 'src/modules/telegram/telegram-update-worker.logic-function';
import webhook from 'src/modules/telegram/telegram-webhook.logic-function';

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
    for (const key of [
      'CORGI_CRM_TELEGRAM_TIME_ZONE',
      'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME',
    ]) {
      expect(variables[key]).toMatchObject({ isSecret: false });
      expect(variables[key]).not.toHaveProperty('value');
    }
  });

  it('keeps the Telegram webhook thin, open only to signed provider requests', () => {
    expect(webhook.success).toBe(true);
    expect(webhook.config.httpRouteTriggerSettings).toEqual({
      path: '/telegram/webhook',
      httpMethod: 'POST',
      isAuthRequired: false,
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
  });
});
