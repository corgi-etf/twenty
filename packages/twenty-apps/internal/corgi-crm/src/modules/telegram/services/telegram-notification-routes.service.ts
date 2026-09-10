export const TELEGRAM_NOTIFICATION_EVENT_TYPES = ['meeting_booked'] as const;

export type TelegramNotificationEventType =
  (typeof TELEGRAM_NOTIFICATION_EVENT_TYPES)[number];

export type TelegramNotificationRoute = {
  event: TelegramNotificationEventType;
  chatId: string;
  messageThreadId?: number;
};

const MAX_ROUTES = 25;
const TELEGRAM_CHAT_ID_PATTERN = /^-?[1-9][0-9]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const invalid = (): never => {
  throw new Error('Invalid Telegram notification route configuration');
};

const isSignedInt64 = (value: string): boolean => {
  const digits = value.startsWith('-') ? value.slice(1) : value;
  if (digits.length < 19) return true;
  if (digits.length > 19) return false;
  return digits <= (value.startsWith('-') ? '9223372036854775808' : '9223372036854775807');
};

const parseRoute = (value: unknown): TelegramNotificationRoute => {
  if (!isRecord(value)) return invalid();
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'chatId,event' && keys !== 'chatId,event,messageThreadId') {
    return invalid();
  }
  if (value.event !== 'meeting_booked' || typeof value.chatId !== 'string') {
    return invalid();
  }
  const chatId = value.chatId.trim();
  if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) return invalid();
  if (!isSignedInt64(chatId)) return invalid();
  const thread = value.messageThreadId;
  if (
    thread !== undefined &&
    (!Number.isSafeInteger(thread) || (thread as number) <= 0)
  ) {
    return invalid();
  }
  return {
    event: value.event,
    chatId,
    ...(thread === undefined ? {} : { messageThreadId: thread as number }),
  };
};

export const parseTelegramNotificationRoutes = (
  raw: string | undefined,
): TelegramNotificationRoute[] => {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid();
  }
  if (isRecord(parsed) && Object.keys(parsed).length === 0) return [];
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'routes,version' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.routes) ||
    parsed.routes.length > MAX_ROUTES
  ) {
    return invalid();
  }
  const routes = parsed.routes.map(parseRoute);
  const destinations = routes.map(
    ({ event, chatId, messageThreadId }) =>
      `${event}:${chatId}:${messageThreadId ?? 'main'}`,
  );
  if (new Set(destinations).size !== destinations.length) {
    throw new Error('Duplicate Telegram notification route destination');
  }
  return routes;
};

export const isTrustedTelegramNotificationRoute = (
  route: TelegramNotificationRoute,
  configuredRoutes: readonly TelegramNotificationRoute[],
): boolean =>
  configuredRoutes.some(
    (candidate) =>
      candidate.event === route.event &&
      candidate.chatId === route.chatId &&
      candidate.messageThreadId === route.messageThreadId,
  );
