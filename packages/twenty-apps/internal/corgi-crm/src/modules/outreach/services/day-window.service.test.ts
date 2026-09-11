import { describe, expect, it } from 'vitest';

import {
  getLocalDayBoundaryWindow,
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

  it('admits a missed tick for the rest of the same local date', () => {
    expect(
      getScheduledAdmission({
        now: new Date('2026-09-10T04:59:59.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toEqual({
      localDate: '2026-09-09',
      scheduledInstant: new Date('2026-09-09T22:00:00.000Z'),
    });
    expect(
      getScheduledAdmission({
        now: new Date('2026-09-09T21:59:59.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toBeNull();
  });

  it('uses the first valid instant after a DST gap', () => {
    expect(
      getScheduledAdmission({
        now: new Date('2026-03-08T08:05:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '02:15',
      }),
    ).toEqual({
      localDate: '2026-03-08',
      scheduledInstant: new Date('2026-03-08T08:00:00.000Z'),
    });
  });

  it('uses the first occurrence during a DST fold', () => {
    expect(
      getScheduledAdmission({
        now: new Date('2026-11-01T07:35:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '01:30',
      }),
    ).toEqual({
      localDate: '2026-11-01',
      scheduledInstant: new Date('2026-11-01T06:30:00.000Z'),
    });
  });

  it('does not catch up a prior local date after the horizon closes', () => {
    expect(
      getScheduledAdmission({
        now: new Date('2026-09-10T21:00:00.000Z'),
        timeZone: 'America/Chicago',
        localTime: '17:00',
      }),
    ).toBeNull();
  });
});

describe('getLocalDayBoundaryWindow', () => {
  const timeZone = 'America/Chicago';

  it('ends at the next boundary after now and spans whole boundary days', () => {
    expect(
      getLocalDayBoundaryWindow({
        now: new Date('2026-09-09T16:30:00.000Z'),
        timeZone,
        boundaryHour: 5,
        days: 3,
      }),
    ).toEqual({
      start: new Date('2026-09-07T10:00:00.000Z'),
      end: new Date('2026-09-10T10:00:00.000Z'),
    });
  });

  it('stays inside the boundary day already under way just before the boundary', () => {
    expect(
      getLocalDayBoundaryWindow({
        now: new Date('2026-09-09T09:59:59.999Z'),
        timeZone,
        boundaryHour: 5,
        days: 1,
      }),
    ).toEqual({
      start: new Date('2026-09-08T10:00:00.000Z'),
      end: new Date('2026-09-09T10:00:00.000Z'),
    });
  });

  it('keeps the wall-clock boundary when daylight saving shortens or lengthens the day', () => {
    expect(
      getLocalDayBoundaryWindow({
        now: new Date('2026-03-07T18:00:00.000Z'),
        timeZone,
        boundaryHour: 5,
        days: 1,
      }),
    ).toEqual({
      start: new Date('2026-03-07T11:00:00.000Z'),
      end: new Date('2026-03-08T10:00:00.000Z'),
    });
    expect(
      getLocalDayBoundaryWindow({
        now: new Date('2026-10-31T18:00:00.000Z'),
        timeZone,
        boundaryHour: 5,
        days: 1,
      }),
    ).toEqual({
      start: new Date('2026-10-31T10:00:00.000Z'),
      end: new Date('2026-11-01T11:00:00.000Z'),
    });
  });

  it.each([
    [{ boundaryHour: 24, days: 1 }, 'Report day boundary must be a whole local hour'],
    [{ boundaryHour: 5.5, days: 1 }, 'Report day boundary must be a whole local hour'],
    [{ boundaryHour: 5, days: 0 }, 'Report window must span whole days'],
    [{ boundaryHour: 5, days: 1.5 }, 'Report window must span whole days'],
  ])('refuses the misconfigured window %j', (overrides, message) => {
    expect(() =>
      getLocalDayBoundaryWindow({
        now: new Date('2026-09-09T16:30:00.000Z'),
        timeZone,
        ...overrides,
      }),
    ).toThrow(message);
  });
});
