export type TelegramGroupTopic = {
  chatId: string;
  messageThreadId: number;
};

const MAX_GROUP_TOPICS = 25;
const SUPERGROUP_CHAT_ID_PATTERN = /^-[1-9][0-9]*$/;
// Telegram's documented Bot API dialog-id range for a supergroup or channel
// (https://core.telegram.org/api/bots/ids). A forum topic can only exist in a
// supergroup, so an id outside this range is a user or basic-group id that the
// operator pasted by mistake, never a topic host.
const MIN_SUPERGROUP_CHAT_ID = -1_997_852_516_352;
const MAX_SUPERGROUP_CHAT_ID = -1_000_000_000_001;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const invalid = (): never => {
  throw new Error('Invalid Telegram group topic configuration');
};

const parseTopic = (value: unknown): TelegramGroupTopic => {
  if (!isRecord(value)) return invalid();
  if (Object.keys(value).sort().join(',') !== 'chatId,messageThreadId') {
    return invalid();
  }
  if (typeof value.chatId !== 'string') return invalid();
  const chatId = value.chatId.trim();
  if (!SUPERGROUP_CHAT_ID_PATTERN.test(chatId)) return invalid();
  const numericChatId = Number(chatId);
  if (
    !Number.isSafeInteger(numericChatId) ||
    numericChatId < MIN_SUPERGROUP_CHAT_ID ||
    numericChatId > MAX_SUPERGROUP_CHAT_ID
  ) {
    return invalid();
  }
  const messageThreadId = value.messageThreadId;
  // A topic-less allowlist entry would admit the whole supergroup, including
  // its General topic, so the thread is mandatory rather than optional here.
  if (!Number.isSafeInteger(messageThreadId) || (messageThreadId as number) <= 0) {
    return invalid();
  }
  return { chatId, messageThreadId: messageThreadId as number };
};

export const parseTelegramGroupTopics = (
  raw: string | undefined,
): TelegramGroupTopic[] => {
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
    Object.keys(parsed).sort().join(',') !== 'topics,version' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.topics) ||
    parsed.topics.length > MAX_GROUP_TOPICS
  ) {
    return invalid();
  }
  const topics = parsed.topics.map(parseTopic);
  const destinations = topics.map(
    ({ chatId, messageThreadId }) => `${chatId}:${messageThreadId}`,
  );
  if (new Set(destinations).size !== destinations.length) {
    throw new Error('Duplicate Telegram group topic');
  }
  return topics;
};

export const isAllowedTelegramGroupTopic = (
  candidate: TelegramGroupTopic,
  allowedTopics: readonly TelegramGroupTopic[],
): boolean =>
  allowedTopics.some(
    (topic) =>
      topic.chatId === candidate.chatId &&
      topic.messageThreadId === candidate.messageThreadId,
  );
