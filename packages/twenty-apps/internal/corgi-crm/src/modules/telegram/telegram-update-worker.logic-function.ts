import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import { parseQueuedTelegramUpdate } from 'src/modules/telegram/services/telegram-security.service';
import { type KeyValueStore } from 'src/modules/telegram/types';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

type UpdateWorkerDependencies = {
  expectedWorkspaceId: string;
  store: KeyValueStore;
  processCommand: typeof processTelegramCommand;
  createCrmClient(): CoreApiClient;
  createTelegramClient(): TelegramClient;
  timeZone: string;
  linkCodesJson: string | undefined;
};

export const handleTelegramUpdateJob = async (
  payload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: UpdateWorkerDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram update worker refused an unexpected workspace');
  }
  const update = parseQueuedTelegramUpdate(payload);
  const key = `telegram:update:${update.updateId}`;
  const existing = (await dependencies.store.get(key)) as {
    status?: string;
    activityId?: string;
  } | null;
  if (existing?.status === 'complete') return { status: 'duplicate' };
  let phase =
    existing?.status === 'crm_committed' ? 'crm_committed' : 'processing';
  if (phase === 'processing') {
    await dependencies.store.set(key, { status: phase });
  }

  const telegram = dependencies.createTelegramClient();
  const coreClient = dependencies.createCrmClient();
  const wholesalerRepository = new CoreWholesalerRepository(coreClient);
  try {
    const result = await dependencies.processCommand(update, {
      repository: new CoreOutreachRepository(coreClient),
      store: dependencies.store,
      timeZone: dependencies.timeZone,
      linkCodesJson: dependencies.linkCodesJson,
      identity: {
        findWorkspaceMember: (workspaceMemberId) =>
          wholesalerRepository.findWorkspaceMemberById(workspaceMemberId),
        findWholesalers: async (workspaceMemberId) =>
          (await wholesalerRepository.findByWorkspaceMemberId(workspaceMemberId))
            .filter(
              ({ id, name, workspaceMemberId: linkedMemberId }) =>
                id && name?.trim() && linkedMemberId === workspaceMemberId,
            )
            .map(({ id, name }) => ({
              id,
              name: name!.trim(),
              workspaceMemberId,
            })),
      },
      send: (chatId, text) => telegram.sendMessage(chatId, text),
      answerCallback: (callbackQueryId) =>
        telegram.answerCallbackQuery(callbackQueryId),
      now: () => new Date(),
      onCrmCommitted: async (activityId) => {
        phase = 'crm_committed';
        await dependencies.store.set(key, { status: phase, activityId });
      },
    },
    phase === 'crm_committed' && existing?.activityId
      ? { status: 'crm_committed', activityId: existing.activityId }
      : undefined);
    await dependencies.store.set(key, { status: 'complete' });
    return result;
  } catch (error) {
    if (phase !== 'crm_committed') {
      await dependencies.store.set(key, { status: 'queued' });
    }
    throw error;
  }
};

export const handler = async (
  payload: unknown,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramUpdateJob(payload, context, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    store: kv,
    processCommand: processTelegramCommand,
    createCrmClient: () => new CoreApiClient(),
    createTelegramClient: () =>
      new TelegramClient({
        token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
      }),
    timeZone: requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
    linkCodesJson: process.env.CORGI_CRM_TELEGRAM_LINK_CODES,
  });

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-update-worker',
  description:
    'Processes an authenticated queued Telegram command against the outreach domain.',
  timeoutSeconds: 60,
  handler,
});
