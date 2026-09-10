import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import {
  kv,
  RetryableLogicFunctionError,
  type LogicFunctionExecutionContext,
} from 'twenty-sdk/logic-function';

import { TELEGRAM_NOTIFICATION_DELIVERY_WORKER_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreTelegramDeliveryRepository } from 'src/modules/telegram/graphql/core-telegram-delivery.repository';
import {
  TelegramClient,
  TelegramDeliveryError,
} from 'src/modules/telegram/services/telegram-client.service';
import {
  buildTelegramDeliveryKey,
  deliverTelegramOperation,
} from 'src/modules/telegram/services/telegram-delivery.service';
import {
  assertIanaTimeZone,
  formatMeetingBookedNotification,
  parseMeetingBookedNotificationEvent,
} from 'src/modules/telegram/services/meeting-booked-notification.service';
import {
  isTrustedTelegramNotificationRoute,
  parseTelegramNotificationRoutes,
} from 'src/modules/telegram/services/telegram-notification-routes.service';
import { type TelegramMeetingBookedDeliveryJob } from 'src/modules/telegram/telegram-meeting-booked-alert.logic-function';
import { type KeyValueStore } from 'src/modules/telegram/types';

type DeliveryWorkerDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  routesJson: string | undefined;
  store: KeyValueStore;
  repository?: CoreTelegramDeliveryRepository;
  createRepository?(): CoreTelegramDeliveryRepository;
  createTelegramClient(): Pick<TelegramClient, 'sendMessage'>;
  now(): Date;
  onUnknown?(event: unknown): void;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parsePayload = (value: unknown): TelegramMeetingBookedDeliveryJob => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Telegram notification delivery job');
  }
  const job = value as Record<string, unknown>;
  if (
    Object.keys(job).sort().join(',') !== 'event,route,timeZone,version' ||
    job.version !== 1 ||
    typeof job.timeZone !== 'string' ||
    !job.timeZone.trim()
  ) {
    throw new Error('Invalid Telegram notification delivery job');
  }
  assertIanaTimeZone(job.timeZone);
  const event = parseMeetingBookedNotificationEvent(job.event);
  const [route] = parseTelegramNotificationRoutes(
    JSON.stringify({ version: 1, routes: [job.route] }),
  );
  if (!route || route.event !== event.type) {
    throw new Error('Invalid Telegram notification delivery job');
  }
  return { version: 1, event, route, timeZone: job.timeZone };
};

export const handleTelegramNotificationDeliveryJob = async (
  rawPayload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: DeliveryWorkerDependencies,
) => {
  if (context?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram notification delivery refused an unexpected workspace');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  const job = parsePayload(rawPayload);
  const trustedRoutes = parseTelegramNotificationRoutes(dependencies.routesJson);
  if (!isTrustedTelegramNotificationRoute(job.route, trustedRoutes)) {
    return { status: 'untrusted-route' } as const;
  }
  const text = formatMeetingBookedNotification(job.event, job.timeZone);
  const repository =
    dependencies.repository ?? dependencies.createRepository?.();
  let client: Pick<TelegramClient, 'sendMessage'> | undefined;
  try {
    return await deliverTelegramOperation({
      deliveryKey: buildTelegramDeliveryKey(
        `notification:${job.event.type}:${job.event.meetingId}:${job.event.bookedAt}:${job.route.chatId}:${job.route.messageThreadId ?? 'main'}`,
      ),
      retryEnvelope: {
        kind: 'message',
        chatId: job.route.chatId,
        text,
        ...(job.route.messageThreadId === undefined
          ? {}
          : { messageThreadId: job.route.messageThreadId }),
      },
      store: dependencies.store,
      repository,
      perform: async (envelope) => {
        if (envelope.kind !== 'message') {
          throw new Error('Invalid Telegram notification envelope');
        }
        client ??= dependencies.createTelegramClient();
        await client.sendMessage(
          envelope.chatId,
          envelope.text,
          envelope.messageThreadId,
        );
      },
      now: dependencies.now,
      onUnknown: dependencies.onUnknown,
    });
  } catch (error) {
    if (error instanceof TelegramDeliveryError && !error.mayHaveSucceeded) {
      throw new RetryableLogicFunctionError(
        'Telegram notification was explicitly rejected before acceptance',
      );
    }
    throw error;
  }
};

export const handler = async (
  payload: unknown,
  context?: LogicFunctionExecutionContext,
) => {
  return handleTelegramNotificationDeliveryJob(payload, context, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    routesJson: process.env.CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES,
    store: kv,
    createRepository: () =>
      new CoreTelegramDeliveryRepository(new CoreApiClient()),
    createTelegramClient: () =>
      new TelegramClient({
        token: requiredEnvironment('CORGI_CRM_TELEGRAM_BOT_TOKEN'),
      }),
    now: () => new Date(),
  });
};

export default defineLogicFunction({
  universalIdentifier:
    TELEGRAM_NOTIFICATION_DELIVERY_WORKER_UNIVERSAL_IDENTIFIER,
  name: 'telegram-notification-delivery-worker',
  description:
    'Revalidates a configured Telegram destination and durably delivers one immutable CRM event alert.',
  timeoutSeconds: 30,
  handler,
});
