import { createHash } from 'node:crypto';

import {
  type DatabaseEventPayload,
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import {
  enqueueJobs,
  kv,
  RetryableLogicFunctionError,
} from 'twenty-sdk/logic-function';

import {
  TELEGRAM_MEETING_BOOKED_ALERT_UNIVERSAL_IDENTIFIER,
  TELEGRAM_NOTIFICATION_DELIVERY_WORKER_UNIVERSAL_IDENTIFIER,
} from 'src/constants';
import { CoreMeetingNotificationRepository } from 'src/modules/telegram/graphql/core-meeting-notification.repository';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  assertIanaTimeZone,
  isSuppressedMeetingCanaryBooking,
  meetingCanarySuppressionKey,
  MeetingBookedNotificationValidationError,
  readMeetingBookedNotificationSnapshot,
  type MeetingBookingNotificationSource,
} from 'src/modules/telegram/services/meeting-booked-notification.service';
import {
  parseTelegramNotificationRoutes,
  type TelegramNotificationRoute,
} from 'src/modules/telegram/services/telegram-notification-routes.service';
import { type KeyValueStore } from 'src/modules/telegram/types';

type MeetingBookedEventRecord = { id?: string; bookedAt?: string | null };
export type MeetingBookedUpdatePayload = DatabaseEventPayload<
  ObjectRecordUpdateEvent<MeetingBookedEventRecord>
>;

export type TelegramMeetingBookedDeliveryJob = {
  version: 1;
  event: Awaited<ReturnType<typeof readMeetingBookedNotificationSnapshot>>;
  route: TelegramNotificationRoute;
  timeZone: string;
};

type AlertDependencies = {
  expectedWorkspaceId: string;
  enabled: string | undefined;
  routesJson: string | undefined;
  canarySuppressionJson: string | undefined;
  timeZone?: string;
  now?: () => number;
  store: KeyValueStore;
  readMeetingBooking(
    meetingId: string,
  ): Promise<MeetingBookingNotificationSource | null>;
  enqueue(
    jobs: Array<{ payload: TelegramMeetingBookedDeliveryJob; jobId: string }>,
  ): Promise<{ enqueued?: boolean; enqueuedJobsCount?: number }>;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const jobId = (
  meetingId: string,
  bookedAt: string,
  route: TelegramNotificationRoute,
) =>
  `telegram-meeting-${createHash('sha256')
    .update(
      `${meetingId}:${bookedAt}:${route.chatId}:${route.messageThreadId ?? 'main'}`,
    )
    .digest('hex')}`;

const transition = (payload: MeetingBookedUpdatePayload) => {
  const { before, after, updatedFields } = payload.properties ?? {};
  if (
    !updatedFields?.includes('bookedAt') ||
    before?.bookedAt !== null ||
    typeof after?.bookedAt !== 'string' ||
    !Number.isFinite(Date.parse(after.bookedAt)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.recordId,
    )
  ) {
    return null;
  }
  return { meetingId: payload.recordId, bookedAt: new Date(after.bookedAt).toISOString() };
};

export const handleTelegramMeetingBookedEvent = async (
  payload: MeetingBookedUpdatePayload,
  dependencies: AlertDependencies,
) => {
  if (payload?.workspaceId !== dependencies.expectedWorkspaceId) {
    throw new Error('Telegram meeting alert refused an unexpected workspace');
  }
  if (dependencies.enabled !== 'true') return { status: 'disabled' } as const;
  const routes = parseTelegramNotificationRoutes(dependencies.routesJson).filter(
    ({ event }) => event === 'meeting_booked',
  );
  if (routes.length === 0) return { status: 'no-routes' } as const;
  const bookedTransition = transition(payload);
  if (!bookedTransition) return { status: 'ignored' } as const;
  const timeZone = dependencies.timeZone?.trim() ?? '';
  assertIanaTimeZone(timeZone);
  try {
    // Decide canary suppression once and persist it beside the snapshot: the
    // token expires, so re-deciding on a retry could let a canary alert escape.
    const decisionKey = meetingCanarySuppressionKey(
      bookedTransition.meetingId,
      bookedTransition.bookedAt,
    );
    const decided = await dependencies.store.get(decisionKey);
    if (decided === true) return { status: 'canary-suppressed' } as const;
    // Reuse the one authoritative read for both the decision and the snapshot,
    // so a genuine booking still costs exactly one CRM read on first delivery
    // and none on a retry.
    let source: MeetingBookingNotificationSource | null | undefined;
    const readMeetingBooking = async (meetingId: string) => {
      if (source === undefined) {
        source = await dependencies.readMeetingBooking(meetingId);
      }
      return source;
    };
    if (decided === null) {
      const booking = await readMeetingBooking(bookedTransition.meetingId);
      const suppressed = isSuppressedMeetingCanaryBooking({
        name: booking?.name,
        suppressionJson: dependencies.canarySuppressionJson,
        now: dependencies.now?.() ?? Date.now(),
      });
      await dependencies.store.set(decisionKey, suppressed);
      if (suppressed) return { status: 'canary-suppressed' } as const;
    }
    const event = await readMeetingBookedNotificationSnapshot({
      ...bookedTransition,
      store: dependencies.store,
      readMeetingBooking,
    });
    const jobs = routes.map((route) => ({
      jobId: jobId(event.meetingId, event.bookedAt, route),
      payload: { version: 1 as const, event, route, timeZone },
    }));
    const result = await dependencies.enqueue(jobs);
    if (result.enqueued !== true || result.enqueuedJobsCount !== jobs.length) {
      throw new Error('Telegram meeting alert jobs were not fully enqueued');
    }
    return { status: 'enqueued', destinations: jobs.length } as const;
  } catch (error) {
    if (error instanceof MeetingBookedNotificationValidationError) throw error;
    throw new RetryableLogicFunctionError(
      'Telegram meeting alert ingress did not complete',
    );
  }
};

export const handler = async (payload: MeetingBookedUpdatePayload) => {
  let repository: CoreMeetingNotificationRepository | undefined;
  return handleTelegramMeetingBookedEvent(payload, {
    expectedWorkspaceId: requiredEnvironment('CORGI_CRM_WORKSPACE_ID'),
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    routesJson: process.env.CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES,
    canarySuppressionJson:
      process.env.CORGI_CRM_MEETING_CANARY_SUPPRESSION,
    timeZone: process.env.CORGI_CRM_TELEGRAM_TIME_ZONE,
    store: kv,
    readMeetingBooking: (meetingId) => {
      repository ??= new CoreMeetingNotificationRepository(
        new RawCoreGraphqlTransport(),
      );
      return repository.findById(meetingId);
    },
    enqueue: (jobs) =>
      enqueueJobs({
        logicFunctionUniversalIdentifier:
          TELEGRAM_NOTIFICATION_DELIVERY_WORKER_UNIVERSAL_IDENTIFIER,
        jobs,
        retryLimit: 5,
      }),
  });
};

export default defineLogicFunction({
  universalIdentifier: TELEGRAM_MEETING_BOOKED_ALERT_UNIVERSAL_IDENTIFIER,
  name: 'telegram-meeting-booked-alert',
  description:
    'Snapshots a valid newly booked meeting and enqueues one alert per trusted Telegram destination.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'meetingBooking.updated',
    updatedFields: ['bookedAt'],
  },
});
