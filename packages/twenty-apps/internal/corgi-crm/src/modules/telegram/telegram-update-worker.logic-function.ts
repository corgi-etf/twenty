import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import { parseTelegramUpdate } from 'src/modules/telegram/services/telegram-security.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const handler = async (payload: unknown) => {
  const update = parseTelegramUpdate(payload);
  const key = `telegram:update:${update.updateId}`;
  const existing = await kv.get<{ status?: string }>(key);
  if (existing?.status === 'complete') return { status: 'duplicate' };
  await kv.set(key, { status: 'processing' });

  const telegram = new TelegramClient({
    token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
  });
  const coreClient = new CoreApiClient();
  const wholesalerRepository = new CoreWholesalerRepository(coreClient);
  try {
    const result = await processTelegramCommand(update, {
      repository: new CoreOutreachRepository(coreClient),
      store: kv,
      timeZone: requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
      linkCodesJson: process.env.CORGI_CRM_TELEGRAM_LINK_CODES,
      findWholesalers: async (workspaceMemberId) =>
        (await wholesalerRepository.findByWorkspaceMemberId(workspaceMemberId))
          .filter(({ id, name }) => id && name?.trim())
          .map(({ id, name }) => ({ id, name: name!.trim() })),
      send: (chatId, text) => telegram.sendMessage(chatId, text),
      answerCallback: (callbackQueryId) =>
        telegram.answerCallbackQuery(callbackQueryId),
      now: () => new Date(),
    });
    await kv.set(key, { status: 'complete' });
    return result;
  } catch (error) {
    await kv.set(key, { status: 'queued' });
    throw error;
  }
};

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-update-worker',
  description:
    'Processes an authenticated queued Telegram command against the outreach domain.',
  timeoutSeconds: 60,
  handler,
});
