import { describe, expect, it, vi } from 'vitest';

import { readScheduledDailyReport } from 'src/modules/telegram/telegram-daily-summary-worker.logic-function';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';

describe('scheduled Telegram team report', () => {
  it('retries the original scheduled snapshot after rejection without reading changed CRM data', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        values.set(key, value);
      },
      delete: async (key: string) => values.delete(key),
    };
    const listActivities = vi.fn().mockResolvedValue([]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TelegramDeliveryError('rate limit', false))
      .mockResolvedValue(undefined);
    const attempt = async () =>
      send(
        await readScheduledDailyReport({
          repository: { listActivities } as never,
          scheduledInstant: '2026-09-10T17:00:00.000Z',
          timeZone: 'America/Chicago',
          store,
          workspaceMemberId: 'member-1',
        }),
      );
    await expect(attempt()).rejects.toThrow('rate limit');
    listActivities.mockRejectedValue(new Error('must not requery'));
    await expect(attempt()).resolves.toBeUndefined();
    expect(send.mock.calls[1]?.[0]).toBe(send.mock.calls[0]?.[0]);
    expect(listActivities).toHaveBeenCalledOnce();
  });

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
      workspaceMemberId: 'member-1',
      store: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        delete: vi.fn(),
      },
    });

    expect(listActivities).toHaveBeenCalledWith({
      start: '2026-09-09T17:00:00.000Z',
      end: '2026-09-10T17:00:00.000Z',
    });
    expect(text).toContain('Total activities: 2');
    expect(text).toContain('1. Alex: 1');
    expect(text).toContain('2. Nash: 1');
  });

  it('keeps concurrent member jobs and their retries on separate immutable reports', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        values.set(key, value);
      },
      delete: async (key: string) => values.delete(key),
    };
    const listActivities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'new-activity',
          wholesalerId: 'owner-2',
          wholesalerName: 'Alex',
          companyName: 'Company',
          activityType: 'email',
          outcome: 'no_response',
          occurredAt: '2026-09-10T16:59:00.000Z',
        },
      ]);
    const read = (workspaceMemberId: string) =>
      readScheduledDailyReport({
        repository: { listActivities } as never,
        store,
        workspaceMemberId,
        scheduledInstant: '2026-09-10T17:00:00.000Z',
        timeZone: 'America/Chicago',
      });
    const original = await Promise.all([read('member-1'), read('member-2')]);
    expect(original[0]).toContain('Total activities: 0');
    expect(original[1]).toContain('Total activities: 1');
    expect(await Promise.all([read('member-1'), read('member-2')])).toEqual(
      original,
    );
    expect(listActivities).toHaveBeenCalledTimes(2);
  });
});
