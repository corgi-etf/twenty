import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { readReportSummary } from 'src/modules/outreach/services/report-summary.service';
import { type OutreachRepository } from 'src/modules/outreach/types';
import { type DailySummaryJobPayload } from 'src/modules/telegram/services/daily-summary-cron.service';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { deliverDailySummary } from 'src/modules/telegram/services/telegram-delivery.service';
import {
  getValidatedTelegramDeliveryRoster,
  parseTelegramLinkBindings,
} from 'src/modules/telegram/services/telegram-link.service';
import { splitTelegramMessage } from 'src/modules/telegram/services/split-telegram-message.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';
import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parsePayload = (value: unknown): DailySummaryJobPayload => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Telegram daily summary job');
  }
  const payload = value as Record<string, unknown>;
  for (const key of [
    'localDate',
    'start',
    'end',
    'workspaceMemberId',
    'scheduledInstant',
  ]) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      throw new Error('Invalid Telegram daily summary job');
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.localDate as string)) {
    throw new Error('Invalid Telegram daily summary local date');
  }
  const start = Date.parse(payload.start as string);
  const end = Date.parse(payload.end as string);
  const scheduledInstant = Date.parse(payload.scheduledInstant as string);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(scheduledInstant) ||
    start >= end ||
    scheduledInstant < start ||
    scheduledInstant >= end
  ) {
    throw new Error('Invalid Telegram daily summary window');
  }
  return payload as DailySummaryJobPayload;
};

type DailySummaryWorkerDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  processJob(payload: unknown): Promise<unknown>;
};

export const readScheduledDailyReport = ({
  repository,
  end,
  timeZone,
}: {
  repository: OutreachRepository;
  end: string;
  timeZone: string;
}) =>
  readReportSummary({
    repository,
    period: 'daily',
    now: new Date(end),
    timeZone,
  });

export const handleTelegramDailySummaryJob = async (
  rawPayload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: DailySummaryWorkerDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram daily summary refused an unexpected workspace');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  return dependencies.processJob(rawPayload);
};

const processDailySummaryJob = async (rawPayload: unknown) => {
  const payload = parsePayload(rawPayload);
  const bindings = parseTelegramLinkBindings(
    process.env.CORGI_CRM_TELEGRAM_LINK_CODES,
  );
  const binding = bindings.find(
    ({ workspaceMemberId }) =>
      workspaceMemberId === payload.workspaceMemberId,
  );
  if (!binding) return { status: 'unlinked' } as const;

  const coreClient = new CoreApiClient();
  const wholesalerRepository = new CoreWholesalerRepository(coreClient);
  const roster = await getValidatedTelegramDeliveryRoster({
    store: kv,
    configuredBindings: [binding],
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
  });
  const link = roster[0];
  if (!link) return { status: 'unlinked' } as const;

  const repository = new CoreOutreachRepository(coreClient);
  const text = await readScheduledDailyReport({
    repository,
    end: payload.end,
    timeZone: requiredEnvironment('CORGI_CRM_TELEGRAM_TIME_ZONE'),
  });
  const telegram = new TelegramClient({
    token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
  });
  return deliverDailySummary({
    localDate: payload.localDate,
    delivery: {
      workspaceMemberId: link.workspaceMemberId,
      chatId: link.chatId,
      messages: splitTelegramMessage(text),
    },
    store: kv,
    repository: new CoreTelegramDeliveryRepository(coreClient),
    send: (chatId, message) => telegram.sendMessage(chatId, message),
  });
};

export const handler = async (
  rawPayload: unknown,
  context?: LogicFunctionExecutionContext,
) =>
  handleTelegramDailySummaryJob(rawPayload, context, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    processJob: processDailySummaryJob,
  });

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-daily-summary-worker',
  description:
    'Revalidates one linked CRM identity and performs at-most-once daily Telegram delivery.',
  timeoutSeconds: 60,
  handler,
});
