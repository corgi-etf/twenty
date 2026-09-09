import {
  buildDailySummaries,
  formatDailySummary,
  formatEmptyDailySummary,
  splitTelegramMessage,
} from 'src/modules/outreach/services/daily-summary.service';
import {
  getZonedDayWindow,
  isScheduledLocalMinute,
} from 'src/modules/outreach/services/day-window.service';
import { type OutreachRepository } from 'src/modules/outreach/types';
import { deliverDailySummaries } from 'src/modules/telegram/services/telegram-delivery.service';
import { type TelegramLink } from 'src/modules/telegram/services/telegram-link.service';
import { type KeyValueStore } from 'src/modules/telegram/types';

export const runDailySummaryCron = async ({
  now,
  timeZone,
  localTime,
  roster,
  repository,
  store,
  send,
}: {
  now: Date;
  timeZone: string;
  localTime: string;
  roster: TelegramLink[];
  repository: OutreachRepository;
  store: KeyValueStore;
  send(chatId: string, text: string): Promise<void>;
}) => {
  if (!isScheduledLocalMinute({ now, timeZone, localTime })) {
    return { status: 'outside_window' } as const;
  }

  const window = getZonedDayWindow({ now, timeZone });
  const deliveries = await Promise.all(
    roster.map(async (link) => {
      const activities = await repository.listActivities({
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        wholesalerId: link.wholesalerId,
      });
      const summary = buildDailySummaries(activities, window.localDate).find(
        ({ wholesalerId }) => wholesalerId === link.wholesalerId,
      );
      const text = summary
        ? formatDailySummary(summary)
        : formatEmptyDailySummary(link.wholesalerName, window.localDate);
      return {
        wholesalerId: link.wholesalerId,
        chatId: link.chatId,
        messages: splitTelegramMessage(text),
      };
    }),
  );
  const result = await deliverDailySummaries({
    localDate: window.localDate,
    deliveries,
    store,
    send,
  });

  return { status: 'delivered', ...result } as const;
};
