import { describe, expect, it } from 'vitest';

import { parseTelegramNotificationRoutes } from 'src/modules/telegram/services/telegram-notification-routes.service';

describe('parseTelegramNotificationRoutes', () => {
  it('defaults to no destinations when configuration is absent', () => {
    expect(parseTelegramNotificationRoutes(undefined)).toEqual([]);
    expect(parseTelegramNotificationRoutes('')).toEqual([]);
    expect(parseTelegramNotificationRoutes('{}')).toEqual([]);
  });

  it('normalizes a meeting route with an optional forum topic', () => {
    expect(
      parseTelegramNotificationRoutes(
        JSON.stringify({
          version: 1,
          routes: [
            {
              event: 'meeting_booked',
              chatId: ' -100123 ',
              messageThreadId: 42,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        event: 'meeting_booked',
        chatId: '-100123',
        messageThreadId: 42,
      },
    ]);
  });

  it.each([
    '{"version":2,"routes":[]}',
    '{"version":1,"routes":[{"event":"other","chatId":"-1001"}]}',
    '{"version":1,"routes":[{"event":"meeting_booked","chatId":"0"}]}',
    '{"version":1,"routes":[{"event":"meeting_booked","chatId":"-1001","messageThreadId":0}]}',
    '{"version":1,"routes":[{"event":"meeting_booked","chatId":"-1001","extra":true}]}',
  ])('rejects untrusted route configuration %s', (raw) => {
    expect(() => parseTelegramNotificationRoutes(raw)).toThrow(
      /notification route/i,
    );
  });

  it('rejects duplicate destinations for the same event', () => {
    expect(() =>
      parseTelegramNotificationRoutes(
        JSON.stringify({
          version: 1,
          routes: [
            { event: 'meeting_booked', chatId: '-1001', messageThreadId: 9 },
            { event: 'meeting_booked', chatId: '-1001', messageThreadId: 9 },
          ],
        }),
      ),
    ).toThrow(/duplicate/i);
  });
});
