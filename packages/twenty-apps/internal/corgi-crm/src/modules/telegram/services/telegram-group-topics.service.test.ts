import { describe, expect, it } from 'vitest';

import {
  isAllowedTelegramGroupTopic,
  parseTelegramGroupTopics,
} from 'src/modules/telegram/services/telegram-group-topics.service';

const CHAT_ID = '-1002394851554';
const THREAD_ID = 304311;

const configuration = (topics: unknown) =>
  JSON.stringify({ version: 1, topics });

describe('parseTelegramGroupTopics', () => {
  it('treats unset and empty configuration as no allowed group', () => {
    expect(parseTelegramGroupTopics(undefined)).toEqual([]);
    expect(parseTelegramGroupTopics('')).toEqual([]);
    expect(parseTelegramGroupTopics('   ')).toEqual([]);
    expect(parseTelegramGroupTopics('{}')).toEqual([]);
    expect(parseTelegramGroupTopics(configuration([]))).toEqual([]);
  });

  it('accepts an explicit supergroup chat and forum topic pair', () => {
    expect(
      parseTelegramGroupTopics(
        configuration([{ chatId: ` ${CHAT_ID} `, messageThreadId: THREAD_ID }]),
      ),
    ).toEqual([{ chatId: CHAT_ID, messageThreadId: THREAD_ID }]);
  });

  it('rejects a chat ID that cannot host a forum topic', () => {
    for (const chatId of [
      '101',
      '-101',
      '-999999999999',
      '-1997852516353',
      '-0',
      'not-a-number',
      '',
    ]) {
      expect(() =>
        parseTelegramGroupTopics(
          configuration([{ chatId, messageThreadId: THREAD_ID }]),
        ),
      ).toThrow(/invalid|supergroup/i);
    }
  });

  it('requires a positive integer topic and refuses a topic-less entry', () => {
    for (const messageThreadId of [0, -1, 1.5, '304311', null]) {
      expect(() =>
        parseTelegramGroupTopics(
          configuration([{ chatId: CHAT_ID, messageThreadId }]),
        ),
      ).toThrow(/invalid|topic/i);
    }
    expect(() =>
      parseTelegramGroupTopics(configuration([{ chatId: CHAT_ID }])),
    ).toThrow(/invalid/i);
  });

  it('rejects unknown keys, wrong versions, and malformed JSON', () => {
    expect(() =>
      parseTelegramGroupTopics(
        configuration([
          { chatId: CHAT_ID, messageThreadId: THREAD_ID, event: 'anything' },
        ]),
      ),
    ).toThrow(/invalid/i);
    expect(() =>
      parseTelegramGroupTopics(
        JSON.stringify({ version: 2, topics: [] }),
      ),
    ).toThrow(/invalid/i);
    expect(() =>
      parseTelegramGroupTopics(JSON.stringify({ topics: [] })),
    ).toThrow(/invalid/i);
    expect(() => parseTelegramGroupTopics('not json')).toThrow(/invalid/i);
    expect(() => parseTelegramGroupTopics('[]')).toThrow(/invalid/i);
  });

  it('rejects duplicate destinations and oversized allowlists', () => {
    expect(() =>
      parseTelegramGroupTopics(
        configuration([
          { chatId: CHAT_ID, messageThreadId: THREAD_ID },
          { chatId: CHAT_ID, messageThreadId: THREAD_ID },
        ]),
      ),
    ).toThrow(/duplicate/i);
    expect(() =>
      parseTelegramGroupTopics(
        configuration(
          Array.from({ length: 26 }, (_unused, index) => ({
            chatId: CHAT_ID,
            messageThreadId: index + 1,
          })),
        ),
      ),
    ).toThrow(/invalid/i);
  });
});

describe('isAllowedTelegramGroupTopic', () => {
  const allowed = [{ chatId: CHAT_ID, messageThreadId: THREAD_ID }];

  it('matches only the exact chat and topic pair', () => {
    expect(
      isAllowedTelegramGroupTopic(
        { chatId: CHAT_ID, messageThreadId: THREAD_ID },
        allowed,
      ),
    ).toBe(true);
    expect(
      isAllowedTelegramGroupTopic(
        { chatId: CHAT_ID, messageThreadId: THREAD_ID + 1 },
        allowed,
      ),
    ).toBe(false);
    expect(
      isAllowedTelegramGroupTopic(
        { chatId: '-1002394851555', messageThreadId: THREAD_ID },
        allowed,
      ),
    ).toBe(false);
    expect(
      isAllowedTelegramGroupTopic(
        { chatId: CHAT_ID, messageThreadId: THREAD_ID },
        [],
      ),
    ).toBe(false);
  });
});
