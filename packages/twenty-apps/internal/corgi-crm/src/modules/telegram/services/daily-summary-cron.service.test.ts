import { describe, expect, it, vi } from 'vitest';

import { runDailySummaryCron } from 'src/modules/telegram/services/daily-summary-cron.service';
import { type OutreachRepository } from 'src/modules/outreach/types';

const repository = (): OutreachRepository => ({
  findCompanies: vi.fn(),
  findContacts: vi.fn(),
  createActivity: vi.fn(),
  listActivities: vi.fn().mockResolvedValue([
    {
      id: 'activity-1',
      wholesalerId: 'wholesaler-1',
      wholesalerName: 'Nash',
      companyName: 'Acme',
      activityType: 'Call',
      outcome: 'Connected',
      occurredAt: '2026-09-09T16:00:00.000Z',
    },
  ]),
});

describe('runDailySummaryCron', () => {
  it('does no work outside the configured local minute', async () => {
    const repo = repository();
    const send = vi.fn();

    await expect(
      runDailySummaryCron({
        now: new Date('2026-09-09T22:15:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
        roster: [{ userId: '101', chatId: '101', wholesalerId: 'wholesaler-1', wholesalerName: 'Nash' }],
        repository: repo,
        store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
        send,
      }),
    ).resolves.toEqual({ status: 'outside_window' });
    expect(repo.listActivities).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('builds and delivers one daily breakdown per linked person', async () => {
    const repo = repository();
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDailySummaryCron({
        now: new Date('2026-09-09T22:00:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
        roster: [{ userId: '101', chatId: '101', wholesalerId: 'wholesaler-1', wholesalerName: 'Nash' }],
        repository: repo,
        store,
        send,
      }),
    ).resolves.toEqual({ status: 'delivered', delivered: 1, skipped: 0 });
    expect(repo.listActivities).toHaveBeenCalledWith({
      start: '2026-09-09T05:00:00.000Z',
      end: '2026-09-10T05:00:00.000Z',
      wholesalerId: 'wholesaler-1',
    });
    expect(send).toHaveBeenCalledWith(
      '101',
      expect.stringContaining('Nash — 2026-09-09\nTotal: 1'),
    );
  });
});
