import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv, type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import {
  buildDailySummaries,
  formatDailySummary,
  formatEmptyDailySummary,
} from 'src/modules/outreach/services/daily-summary.service';
import { type DailySummaryJobPayload } from 'src/modules/telegram/services/daily-summary-cron.service';
import { TelegramClient } from 'src/modules/telegram/services/telegram-client.service';
import { deliverDailySummary } from 'src/modules/telegram/services/telegram-delivery.service';
import {
  getValidatedTelegramDeliveryRoster,
  parseTelegramLinkBindings,
} from 'src/modules/telegram/services/telegram-link.service';
import { splitTelegramMessage } from 'src/modules/telegram/services/split-telegram-message.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

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
  for (const key of ['localDate', 'start', 'end', 'workspaceMemberId']) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      throw new Error('Invalid Telegram daily summary job');
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.localDate as string)) {
    throw new Error('Invalid Telegram daily summary local date');
  }
  const start = Date.parse(payload.start as string);
  const end = Date.parse(payload.end as string);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('Invalid Telegram daily summary window');
  }
  return payload as DailySummaryJobPayload;
};

export const handler = async (
  rawPayload: unknown,
  context?: LogicFunctionExecutionContext,
) => {
  const expectedWorkspaceId = requiredEnvironment('CORGI_CRM_WORKSPACE_ID');
  if (context?.workspaceId !== expectedWorkspaceId) {
    throw new Error('Telegram daily summary refused an unexpected workspace');
  }
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
  const activities = await repository.listActivities({
    start: payload.start,
    end: payload.end,
    wholesalerId: link.wholesalerId,
  });
  const summary = buildDailySummaries(activities, payload.localDate).find(
    ({ wholesalerId }) => wholesalerId === link.wholesalerId,
  );
  const text = summary
    ? formatDailySummary(summary)
    : formatEmptyDailySummary(link.wholesalerName, payload.localDate);
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
    send: (chatId, message) => telegram.sendMessage(chatId, message),
  });
};

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_DAILY_SUMMARY_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-daily-summary-worker',
  description:
    'Revalidates one linked CRM identity and performs at-most-once daily Telegram delivery.',
  timeoutSeconds: 60,
  handler,
});
