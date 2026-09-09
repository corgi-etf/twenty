import {
  getZonedDayWindow,
  isScheduledLocalMinute,
} from 'src/modules/outreach/services/day-window.service';
import { type TelegramLink } from 'src/modules/telegram/services/telegram-link.service';

export type DailySummaryJobPayload = {
  localDate: string;
  start: string;
  end: string;
  workspaceMemberId: string;
};

export const runDailySummaryCron = async ({
  now,
  timeZone,
  localTime,
  roster,
  enqueue,
}: {
  now: Date;
  timeZone: string;
  localTime: string;
  roster: TelegramLink[];
  enqueue(payload: DailySummaryJobPayload, jobId: string): Promise<unknown>;
}) => {
  if (!isScheduledLocalMinute({ now, timeZone, localTime })) {
    return { status: 'outside_window' } as const;
  }

  const window = getZonedDayWindow({ now, timeZone });
  await Promise.all(
    roster.map(({ workspaceMemberId }) =>
      enqueue(
        {
          localDate: window.localDate,
          start: window.start.toISOString(),
          end: window.end.toISOString(),
          workspaceMemberId,
        },
        `telegram-summary-${window.localDate}-${workspaceMemberId}`,
      ),
    ),
  );
  return { status: 'enqueued', enqueued: roster.length } as const;
};
