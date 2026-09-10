import { describe, expect, it, vi } from 'vitest';

import { readScheduledDailyReport } from 'src/modules/telegram/telegram-daily-summary-worker.logic-function';

describe('scheduled Telegram team report', () => {
  it('uses the exact rolling 24-hour window and all activity owners', async () => {
    const listActivities = vi.fn().mockResolvedValue([
      {
        id: 'activity-1',
        wholesalerId: 'owner-1',
        wholesalerName: 'Nash',
        companyName: 'One',
        activityType: 'phone_call',
        outcome: 'connected',
        occurredAt: '2026-09-09T17:00:00.000Z',
      },
      {
        id: 'activity-2',
        wholesalerId: 'owner-2',
        wholesalerName: 'Alex',
        companyName: 'Two',
        activityType: 'email',
        outcome: 'no_response',
        occurredAt: '2026-09-10T16:59:59.000Z',
      },
    ]);
    const text = await readScheduledDailyReport({
      repository: { listActivities } as never,
      scheduledInstant: '2026-09-10T17:00:00.000Z',
      timeZone: 'America/Chicago',
    });

    expect(listActivities).toHaveBeenCalledWith({
      start: '2026-09-09T17:00:00.000Z',
      end: '2026-09-10T17:00:00.000Z',
    });
    expect(text).toContain('Total activities: 2');
    expect(text).toContain('1. Alex: 1');
    expect(text).toContain('2. Nash: 1');
  });
});
