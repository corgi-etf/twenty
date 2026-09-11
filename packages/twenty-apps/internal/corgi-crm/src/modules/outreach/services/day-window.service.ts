type CalendarDate = { year: number; month: number; day: number };

const dateTimeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const partsAt = (instant: Date, timeZone: string) => {
  const entries = dateTimeFormatter(timeZone)
    .formatToParts(instant)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)] as const);

  return Object.fromEntries(entries) as Record<
    'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
    number
  >;
};

const localWallTimeToUtc = (
  date: CalendarDate,
  hour: number,
  timeZone: string,
): { instant: Date; exact: boolean } => {
  const localAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour);
  let candidate = localAsUtc;

  // Time-zone offsets can change near the candidate. Iterating converges on
  // the instant whose formatted wall clock is the requested local time.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = partsAt(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const next = candidate + (localAsUtc - representedAsUtc);
    if (next === candidate) return { instant: new Date(candidate), exact: true };
    candidate = next;
  }

  // Reached only when the requested wall time does not exist in the zone, so
  // no instant formats back to it and the iteration oscillates around the gap.
  const instant = new Date(candidate);
  const parts = partsAt(instant, timeZone);
  return {
    instant,
    exact:
      parts.year === date.year &&
      parts.month === date.month &&
      parts.day === date.day &&
      parts.hour === hour &&
      parts.minute === 0,
  };
};

const localMidnightToUtc = (date: CalendarDate, timeZone: string): Date => {
  const { instant, exact } = localWallTimeToUtc(date, 0, timeZone);
  if (!exact) throw new Error(`Could not resolve local midnight in ${timeZone}`);
  return instant;
};

const shiftCalendarDate = (
  { year, month, day }: CalendarDate,
  days: number,
): CalendarDate => {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

export const getZonedDayWindow = ({
  now,
  timeZone,
}: {
  now: Date;
  timeZone: string;
}) => {
  const { year, month, day } = partsAt(now, timeZone);
  const date = { year, month, day };

  return {
    localDate: `${year}-${pad(month)}-${pad(day)}`,
    start: localMidnightToUtc(date, timeZone),
    end: localMidnightToUtc(shiftCalendarDate(date, 1), timeZone),
  };
};

// A reporting day runs from a fixed local hour to that same hour, so the window
// follows the wall clock instead of a fixed number of hours: one such day is 23
// or 25 hours long across a daylight saving transition. `days` whole reporting
// days end at the next boundary after `now`, so the day under way is included
// and every earlier day is whole.
export const getLocalDayBoundaryWindow = ({
  now,
  timeZone,
  boundaryHour,
  days,
}: {
  now: Date;
  timeZone: string;
  boundaryHour: number;
  days: number;
}): { start: Date; end: Date } => {
  if (!Number.isInteger(boundaryHour) || boundaryHour < 0 || boundaryHour > 23) {
    throw new Error('Report day boundary must be a whole local hour');
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('Report window must span whole days');
  }
  const parts = partsAt(now, timeZone);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  // Before the boundary hour the reporting day under way began yesterday.
  const currentDay =
    parts.hour < boundaryHour ? shiftCalendarDate(today, -1) : today;

  return {
    start: localWallTimeToUtc(
      shiftCalendarDate(currentDay, 1 - days),
      boundaryHour,
      timeZone,
    ).instant,
    end: localWallTimeToUtc(
      shiftCalendarDate(currentDay, 1),
      boundaryHour,
      timeZone,
    ).instant,
  };
};

export const isScheduledLocalMinute = ({
  now,
  timeZone,
  localTime,
}: {
  now: Date;
  timeZone: string;
  localTime: string;
}): boolean => {
  if (!/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(localTime)) {
    throw new Error('Daily summary time must be HH:MM on a 15-minute boundary');
  }
  const parts = partsAt(now, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}` === localTime;
};

export const getScheduledAdmission = ({
  now,
  timeZone,
  localTime,
}: {
  now: Date;
  timeZone: string;
  localTime: string;
}): { localDate: string; scheduledInstant: Date } | null => {
  if (!/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(localTime)) {
    throw new Error('Daily summary time must be HH:MM on a 15-minute boundary');
  }
  const window = getZonedDayWindow({ now, timeZone });
  const [hour, minute] = localTime.split(':').map(Number) as [number, number];
  const targetMinute = hour * 60 + minute;
  let scheduledInstant: Date | undefined;
  // Scan the bounded local day in chronological order. This selects the first
  // occurrence during a fold and the first valid wall minute after a gap.
  for (
    let candidate = window.start.getTime();
    candidate < window.end.getTime();
    candidate += 60_000
  ) {
    const represented = partsAt(new Date(candidate), timeZone);
    if (represented.hour * 60 + represented.minute >= targetMinute) {
      scheduledInstant = new Date(candidate);
      break;
    }
  }
  if (
    !scheduledInstant ||
    now.getTime() < scheduledInstant.getTime() ||
    now.getTime() >= window.end.getTime()
  ) {
    return null;
  }
  return { localDate: window.localDate, scheduledInstant };
};
