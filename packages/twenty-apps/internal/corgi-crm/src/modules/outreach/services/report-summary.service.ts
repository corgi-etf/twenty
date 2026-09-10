import {
  type MeetingBookingReportRepository,
  type ReportMeetingBooking,
} from 'src/modules/outreach/report-meeting-booking.types';
import {
  type OutreachActivity,
  type OutreachRepository,
} from 'src/modules/outreach/types';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export type ReportSummary = {
  period: ReportPeriod;
  timeZone: string;
  start: Date;
  end: Date;
  total: number;
  totalMeetingsSet: number;
  leaderboard: OwnerCount[];
};

type OwnerCount = {
  ownerId: string;
  name: string;
  count: number;
  meetingsSet: number;
};

const REPORT_DAYS: Record<ReportPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};
const REPORT_TITLES: Record<ReportPeriod, string> = {
  daily: 'Daily outreach report — last 24 hours',
  weekly: 'Weekly outreach report — last 7 days, excluding Saturday/Sunday',
  monthly: 'Monthly outreach report — last 30 days',
};

const cleanLabel = (value: string, fallback: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;

export const getReportWindow = ({
  period,
  now,
}: {
  period: ReportPeriod;
  now: Date;
}) => ({
  start: new Date(now.getTime() - REPORT_DAYS[period] * 24 * 60 * 60 * 1000),
  end: new Date(now.getTime()),
});

// Activities and bookings share one owner row, so someone who booked a meeting
// without logging an activity is still counted rather than dropped.
const addOwnerCount = (
  owners: Map<string, OwnerCount>,
  record: { wholesalerId: string; wholesalerName: string },
  field: 'count' | 'meetingsSet',
) => {
  const ownerId = record.wholesalerId.trim() || 'unassigned';
  const name = cleanLabel(record.wholesalerName, 'Unassigned');
  const owner = owners.get(ownerId);
  if (owner) {
    owner[field] += 1;
    // Owner labels can differ between query pages; retain a stable choice.
    if (name.localeCompare(owner.name, 'en') < 0) owner.name = name;
  } else {
    const created: OwnerCount = { ownerId, name, count: 0, meetingsSet: 0 };
    created[field] = 1;
    owners.set(ownerId, created);
  }
};

const compareOwners = (left: OwnerCount, right: OwnerCount) =>
  right.count - left.count ||
  right.meetingsSet - left.meetingsSet ||
  left.name.localeCompare(right.name, 'en') ||
  left.ownerId.localeCompare(right.ownerId, 'en');

export const buildReportSummary = ({
  activities,
  meetingBookings,
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): ReportSummary => {
  if (!Array.isArray(meetingBookings)) {
    throw new Error('Meeting booking report data is unavailable');
  }
  const { start, end } = getReportWindow({ period, now });
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
  const owners = new Map<string, OwnerCount>();
  const seenIds = new Set<string>();
  const seenBookingIds = new Set<string>();
  const isIncluded = (value: string) => {
    const instant = new Date(value);
    return (
      instant >= start &&
      instant < end &&
      (period !== 'weekly' || !['Sat', 'Sun'].includes(weekday.format(instant)))
    );
  };

  for (const activity of activities) {
    if (!isIncluded(activity.occurredAt) || seenIds.has(activity.id))
      continue;
    seenIds.add(activity.id);
    addOwnerCount(owners, activity, 'count');
  }

  for (const booking of meetingBookings) {
    if (!isIncluded(booking.bookedAt) || seenBookingIds.has(booking.id)) continue;
    seenBookingIds.add(booking.id);
    addOwnerCount(owners, booking, 'meetingsSet');
  }

  return {
    period,
    timeZone,
    start,
    end,
    total: seenIds.size,
    totalMeetingsSet: seenBookingIds.size,
    leaderboard: [...owners.values()].sort(compareOwners),
  };
};

export const formatReportSummary = (summary: ReportSummary): string => {
  const timestamp = new Intl.DateTimeFormat('en-US', {
    timeZone: summary.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const formatRank = (index: number) =>
    ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;
  const formatMeetings = (count: number) =>
    `${count} ${count === 1 ? 'meeting' : 'meetings'} set`;

  return [
    `🎉 ${REPORT_TITLES[summary.period]}`,
    `${timestamp.format(summary.start)} → ${timestamp.format(summary.end)} (${summary.timeZone})`,
    'All CRM owners',
    '',
    `📊 Total activities: ${summary.total}`,
    `📅 Meetings set: ${summary.totalMeetingsSet}`,
    'Meetings counted when booked, not when scheduled.',
    '',
    '🏆 Activity leaderboard',
    ...summary.leaderboard.map(
      ({ name, count, meetingsSet }, index) =>
        `${formatRank(index)} ${name}: ${count} ${count === 1 ? 'activity' : 'activities'} · ${formatMeetings(meetingsSet)}`,
    ),
    ...(summary.total === 0 ? ['No outreach logged in this period.'] : []),
    ...(summary.totalMeetingsSet === 0
      ? ['No meetings booked in this period.']
      : []),
  ].join('\n');
};

export const readReportSummary = async ({
  repository,
  meetingRepository,
  period,
  now,
  timeZone,
}: {
  repository: Pick<OutreachRepository, 'listActivities'>;
  meetingRepository: MeetingBookingReportRepository;
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): Promise<string> => {
  const window = getReportWindow({ period, now });
  const input = {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  };
  const [activities, meetingBookings] = await Promise.all([
    repository.listActivities(input),
    meetingRepository.listMeetingBookings(input),
  ]);
  return formatReportSummary(
    buildReportSummary({ activities, meetingBookings, period, now, timeZone }),
  );
};
