import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_DAILY_SUMMARY_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { runDailySummaryCron } from 'src/modules/telegram/services/daily-summary-cron.service';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { getTelegramDeliveryRoster } from 'src/modules/telegram/services/telegram-link.service';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const handler = async (
  _payload: unknown,
  context?: LogicFunctionExecutionContext,
) => {
  const expectedWorkspaceId = requiredEnvironment('CORGI_CRM_WORKSPACE_ID');
  if (context?.workspaceId !== expectedWorkspaceId) {
    throw new Error('Telegram daily summary refused an unexpected workspace');
  }
  const telegram = new TelegramClient({
    token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
  });
  return runDailySummaryCron({
    now: new Date(),
    timeZone: requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
    localTime: requiredEnvironment('CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME'),
    roster: await getTelegramDeliveryRoster(kv),
    repository: new CoreOutreachRepository(new CoreApiClient()),
    store: kv,
    send: (chatId, text) => telegram.sendMessage(chatId, text),
  });
};

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DAILY_SUMMARY_UNIVERSAL_IDENTIFIER,
  name: 'telegram-daily-outreach-summary',
  description:
    'Runs every 15 minutes, gates on configured IANA local time, and sends one durable per-person daily outreach breakdown.',
  timeoutSeconds: 300,
  handler,
  cronTriggerSettings: { pattern: '*/15 * * * *' },
});
