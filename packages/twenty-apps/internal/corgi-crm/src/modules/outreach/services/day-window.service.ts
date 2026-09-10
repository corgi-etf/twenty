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

const localMidnightToUtc = (date: CalendarDate, timeZone: string): Date => {
  const localAsUtc = Date.UTC(date.year, date.month - 1, date.day);
  let candidate = localAsUtc;

  // Time-zone offsets can change near the candidate. Iterating converges on
  // the instant whose formatted wall clock is the requested local midnight.
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
    if (next === candidate) return new Date(candidate);
    candidate = next;
  }

  const result = new Date(candidate);
  const parts = partsAt(result, timeZone);
  if (
    parts.year !== date.year ||
    parts.month !== date.month ||
    parts.day !== date.day ||
    parts.hour !== 0 ||
    parts.minute !== 0
  ) {
    throw new Error(`Could not resolve local midnight in ${timeZone}`);
  }
  return result;
};

const nextCalendarDate = ({ year, month, day }: CalendarDate): CalendarDate => {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
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
    end: localMidnightToUtc(nextCalendarDate(date), timeZone),
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
