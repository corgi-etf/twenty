import { describe, expect, it } from 'vitest';

import {
  getScheduledAdmission,
  getZonedDayWindow,
  isScheduledLocalMinute,
} from 'src/modules/outreach/services/day-window.service';

describe('getZonedDayWindow', () => {
  it('uses the 23-hour local day when daylight saving time starts', () => {
    const window = getZonedDayWindow({
      now: new Date('2026-03-08T18:00:00.000Z'),
      timeZone: 'America/Chicago',
    });

    expect(window).toEqual({
      localDate: '2026-03-08',
      start: new Date('2026-03-08T06:00:00.000Z'),
      end: new Date('2026-03-09T05:00:00.000Z'),
    });
  });

  it('uses the 25-hour local day when daylight saving time ends', () => {
    const window = getZonedDayWindow({
      now: new Date('2026-11-01T18:00:00.000Z'),
      timeZone: 'America/Chicago',
    });

    expect(window).toEqual({
      localDate: '2026-11-01',
      start: new Date('2026-11-01T05:00:00.000Z'),
      end: new Date('2026-11-02T06:00:00.000Z'),
    });
  });

  it('gates a UTC cron tick using the configured IANA time zone', () => {
    expect(
      isScheduledLocalMinute({
        now: new Date('2026-09-09T22:00:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toBe(true);
    expect(
      isScheduledLocalMinute({
        now: new Date('2026-09-09T22:15:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toBe(false);
  });

  it('admits a delayed cron anywhere in its deterministic 15-minute window', () => {
    expect(
      getScheduledAdmission({
        now: new Date('2026-09-09T22:07:59.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toEqual({
      localDate: '2026-09-09',
      scheduledInstant: new Date('2026-09-09T22:00:00.000Z'),
    });
    expect(
      getScheduledAdmission({
        now: new Date('2026-09-09T22:15:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toBeNull();
  });
});
