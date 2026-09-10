import { describe, expect, it, vi } from 'vitest';

import { runDailySummaryCron } from 'src/modules/telegram/services/daily-summary-cron.service';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const roster = [
  {
    workspaceMemberId: MEMBER_ID,
    userId: '101',
    chatId: '101',
    wholesalerId: 'wholesaler-1',
    wholesalerName: 'Nash',
  },
];

describe('runDailySummaryCron', () => {
  it('does no work outside the configured local minute', async () => {
    const enqueue = vi.fn();

    await expect(
      runDailySummaryCron({
        now: new Date('2026-09-09T22:15:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
        roster,
        enqueue,
      }),
    ).resolves.toEqual({ status: 'outside_window' });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('admits one deterministic daily delivery job per linked member', async () => {
    const enqueue = vi.fn().mockResolvedValue({ enqueued: true });

    await expect(
      runDailySummaryCron({
        now: new Date('2026-09-09T22:00:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
        roster,
        enqueue,
      }),
    ).resolves.toEqual({ status: 'enqueued', enqueued: 1 });
    expect(enqueue).toHaveBeenCalledWith(
      {
        localDate: '2026-09-09',
        start: '2026-09-09T05:00:00.000Z',
        end: '2026-09-10T05:00:00.000Z',
        scheduledInstant: '2026-09-09T22:00:00.000Z',
        workspaceMemberId: MEMBER_ID,
      },
      `telegram-summary-2026-09-09-${MEMBER_ID}`,
    );
  });

  it('uses the scheduled instant when execution is delayed within the admission window', async () => {
    const enqueue = vi.fn().mockResolvedValue({ enqueued: true });
    await expect(
      runDailySummaryCron({
        now: new Date('2026-09-09T22:09:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
        roster,
        enqueue,
      }),
    ).resolves.toEqual({ status: 'enqueued', enqueued: 1 });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        localDate: '2026-09-09',
        scheduledInstant: '2026-09-09T22:00:00.000Z',
      }),
      `telegram-summary-2026-09-09-${MEMBER_ID}`,
    );
  });

  it('concurrent cron invocations address the same authoritative queue job', async () => {
    const jobIds: string[] = [];
    const enqueue = vi.fn(async (_payload: unknown, jobId: string) => {
      jobIds.push(jobId);
      return { enqueued: true };
    });
    const input = {
      now: new Date('2026-09-09T22:00:00.000Z'),
      timeZone: 'America/Chicago',
      localTime: '17:00',
      roster,
      enqueue,
    };

    await Promise.all([runDailySummaryCron(input), runDailySummaryCron(input)]);
    expect(jobIds).toEqual([
      `telegram-summary-2026-09-09-${MEMBER_ID}`,
      `telegram-summary-2026-09-09-${MEMBER_ID}`,
    ]);
  });
});
