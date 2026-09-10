import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_UPDATE_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { CoreMeetingBookingReportRepository } from 'src/modules/outreach/graphql/core-meeting-booking-report.repository';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import {
  buildTelegramDeliveryKey,
  deliverTelegramOperation,
} from 'src/modules/telegram/services/telegram-delivery.service';
import { parseQueuedTelegramUpdate } from 'src/modules/telegram/services/telegram-security.service';
import { type KeyValueStore } from 'src/modules/telegram/types';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';
import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

type UpdateWorkerDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  store: KeyValueStore;
  processCommand: typeof processTelegramCommand;
  createCrmClient(): CoreApiClient;
  createRawCrmTransport(): RawCoreGraphqlTransport;
  createTelegramClient(): TelegramClient;
  timeZone: string;
  publicReportsEnabled: string | undefined;
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
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
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
  const rawTransport = dependencies.createRawCrmTransport();
  const wholesalerRepository = new CoreWholesalerRepository(
    coreClient,
    rawTransport,
  );
  const deliveryRepository = new CoreTelegramDeliveryRepository(coreClient);
  let messageIndex = 0;
  let callbackIndex = 0;
  try {
    const result = await dependencies.processCommand(update, {
      repository: new CoreOutreachRepository(coreClient, rawTransport),
      meetingRepository: new CoreMeetingBookingReportRepository(rawTransport),
      store: dependencies.store,
      timeZone: dependencies.timeZone,
      publicReportsEnabled: dependencies.publicReportsEnabled,
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
      send: async (chatId, text) => {
        const deliveryKey = buildTelegramDeliveryKey(
          `interactive:${update.updateId}:message:${messageIndex}`,
        );
        messageIndex += 1;
        await deliverTelegramOperation({
          deliveryKey,
          retryEnvelope: { kind: 'message', chatId, text },
          store: dependencies.store,
          repository: deliveryRepository,
          perform: (envelope) =>
            envelope.kind === 'message'
              ? telegram.sendMessage(envelope.chatId, envelope.text)
              : Promise.reject(new Error('Invalid Telegram message envelope')),
          now: () => new Date(),
        });
      },
      answerCallback: async (callbackQueryId) => {
        const deliveryKey = buildTelegramDeliveryKey(
          `interactive:${update.updateId}:callback:${callbackIndex}`,
        );
        callbackIndex += 1;
        await deliverTelegramOperation({
          deliveryKey,
          retryEnvelope: { kind: 'callback', callbackQueryId },
          store: dependencies.store,
          repository: deliveryRepository,
          perform: (envelope) =>
            envelope.kind === 'callback'
              ? telegram.answerCallbackQuery(envelope.callbackQueryId)
              : Promise.reject(new Error('Invalid Telegram callback envelope')),
          now: () => new Date(),
        });
      },
      // Retried commands must retain the original reporting window and reply
      // digest, including retries that cross a minute or local-day boundary.
      now: () => new Date(update.messageTimestamp),
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
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    store: kv,
    processCommand: processTelegramCommand,
    createCrmClient: () => new CoreApiClient(),
    createRawCrmTransport: () => new RawCoreGraphqlTransport(),
    createTelegramClient: () =>
      new TelegramClient({
        token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
      }),
    timeZone: requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
    publicReportsEnabled:
      process.env.CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED,
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
