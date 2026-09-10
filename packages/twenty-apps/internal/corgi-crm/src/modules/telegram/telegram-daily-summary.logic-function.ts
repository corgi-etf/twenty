import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import {
  enqueueJob,
  kv,
  type LogicFunctionExecutionContext,
} from 'twenty-sdk/logic-function';

import {
  TELEGRAM_DAILY_SUMMARY_UNIVERSAL_IDENTIFIER,
  TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import {
  type DailySummaryJobPayload,
  runDailySummaryCron,
} from 'src/modules/telegram/services/daily-summary-cron.service';
import {
  getValidatedTelegramDeliveryRoster,
  parseTelegramLinkBindings,
  type TelegramLink,
} from 'src/modules/telegram/services/telegram-link.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

type DailySummaryDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  now(): Date;
  timeZone: string | undefined;
  localTime: string | undefined;
  loadRoster(): Promise<TelegramLink[]>;
  enqueue(payload: DailySummaryJobPayload, jobId: string): Promise<unknown>;
};

export const handleTelegramDailySummary = async (
  _payload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: DailySummaryDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram daily summary refused an unexpected workspace');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  return runDailySummaryCron({
    now: dependencies.now(),
    timeZone:
      dependencies.timeZone?.trim() ||
      requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
    localTime:
      dependencies.localTime?.trim() ||
      requiredEnvironment('CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME'),
    roster: await dependencies.loadRoster(),
    enqueue: dependencies.enqueue,
  });
};

export const handler = async (
  payload: unknown,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramDailySummary(payload, context, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    now: () => new Date(),
    timeZone: process.env.CORGI_CRM_TELEGRAM_TIME_ZONE,
    localTime: process.env.CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME,
    loadRoster: async () => {
      const coreClient = new CoreApiClient();
      const wholesalerRepository = new CoreWholesalerRepository(coreClient);
      return getValidatedTelegramDeliveryRoster({
        store: kv,
        configuredBindings: parseTelegramLinkBindings(
          process.env.CORGI_CRM_TELEGRAM_LINK_CODES,
        ),
        identity: {
          findWorkspaceMember: (workspaceMemberId) =>
            wholesalerRepository.findWorkspaceMemberById(workspaceMemberId),
          findWholesalers: async (workspaceMemberId) =>
            (
              await wholesalerRepository.findByWorkspaceMemberId(
                workspaceMemberId,
              )
            )
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
      });
    },
    enqueue: (payload, jobId) =>
      enqueueJob({
        logicFunctionUniversalIdentifier:
          TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER,
        payload,
        jobId,
        retryLimit: 5,
      }),
  });

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DAILY_SUMMARY_UNIVERSAL_IDENTIFIER,
  name: 'telegram-daily-outreach-summary',
  description:
    'Runs every 15 minutes, gates on configured IANA local time, and admits one deterministic delivery job per linked person.',
  timeoutSeconds: 300,
  handler,
  cronTriggerSettings: { pattern: '*/15 * * * *' },
});
