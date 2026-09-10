import { type SummaryCount } from 'src/modules/outreach/services/daily-summary.service';
import { type ReportMeetingBooking } from 'src/modules/outreach/report-meeting-booking.types';
import {
  isQuickLogActivityType,
  isQuickLogOutcome,
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_OUTCOME_LABELS,
} from 'src/modules/outreach/quick-log-taxonomy';
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
  activityCounts: SummaryCount[];
  outcomeCounts: SummaryCount[];
  leaderboard: Array<OwnerCount & { meetingsSet: number }>;
  meetingLeaderboard: OwnerCount[];
};

type OwnerCount = { ownerId: string; name: string; count: number };

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

const sortedCounts = (counts: Map<string, number>): SummaryCount[] =>
  [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));

const addOwnerCount = (
  owners: Map<string, OwnerCount>,
  record: { wholesalerId: string; wholesalerName: string },
) => {
  const ownerId = record.wholesalerId.trim() || 'unassigned';
  const name = cleanLabel(record.wholesalerName, 'Unassigned');
  const owner = owners.get(ownerId);
  if (owner) {
    owner.count += 1;
    // Owner labels can differ between query pages; retain a stable choice.
    if (name.localeCompare(owner.name, 'en') < 0) owner.name = name;
  } else {
    owners.set(ownerId, { ownerId, name, count: 1 });
  }
};

const compareOwners = (left: OwnerCount, right: OwnerCount) =>
  right.count - left.count ||
  left.name.localeCompare(right.name, 'en') ||
  left.ownerId.localeCompare(right.ownerId, 'en');

export const buildReportSummary = ({
  activities,
  meetingBookings = [],
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
  meetingBookings?: ReportMeetingBooking[];
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): ReportSummary => {
  const { start, end } = getReportWindow({ period, now });
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
  const activityCounts = new Map<string, number>();
  const outcomeCounts = new Map<string, number>();
  const owners = new Map<string, OwnerCount>();
  const meetingOwners = new Map<string, OwnerCount>();
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

    const activityType = cleanLabel(activity.activityType, 'Unspecified');
    const outcome = cleanLabel(activity.outcome, 'Unspecified');
    activityCounts.set(
      activityType,
      (activityCounts.get(activityType) ?? 0) + 1,
    );
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);

    addOwnerCount(owners, activity);
  }

  for (const booking of meetingBookings) {
    if (!isIncluded(booking.bookedAt) || seenBookingIds.has(booking.id)) continue;
    seenBookingIds.add(booking.id);
    addOwnerCount(meetingOwners, booking);
  }

  return {
    period,
    timeZone,
    start,
    end,
    total: seenIds.size,
    totalMeetingsSet: seenBookingIds.size,
    activityCounts: sortedCounts(activityCounts),
    outcomeCounts: sortedCounts(outcomeCounts),
    leaderboard: [...owners.values()].sort(compareOwners).map((owner) => ({
      ...owner,
      meetingsSet: meetingOwners.get(owner.ownerId)?.count ?? 0,
    })),
    meetingLeaderboard: [...meetingOwners.values()].sort(compareOwners),
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
  const formatCounts = (
    counts: SummaryCount[],
    labelFor: (label: string) => string,
  ) =>
    counts.map(({ label, count }) => `${labelFor(label)}: ${count}`).join(', ') || 'None';
  const formatRank = (index: number) =>
    `${['🥇 ', '🥈 ', '🥉 '][index] ?? ''}${index + 1}.`;
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
    `📋 By activity: ${formatCounts(summary.activityCounts, (label) =>
      isQuickLogActivityType(label) ? QUICK_LOG_ACTIVITY_LABELS[label] : label,
    )}`,
    `🎯 By outcome: ${formatCounts(summary.outcomeCounts, (label) =>
      isQuickLogOutcome(label) ? QUICK_LOG_OUTCOME_LABELS[label] : label,
    )}`,
    '',
    '🏆 Activity leaderboard',
    ...summary.leaderboard.map(
      ({ name, count, meetingsSet }, index) =>
        `${formatRank(index)} ${name}: ${count} ${count === 1 ? 'activity' : 'activities'} · ${formatMeetings(meetingsSet)}`,
    ),
    ...(summary.total === 0 ? ['No outreach logged in this period.'] : []),
    '',
    '🤝 Meeting-booking leaderboard',
    ...summary.meetingLeaderboard.map(
      ({ name, count }, index) =>
        `${formatRank(index)} ${name}: ${formatMeetings(count)}`,
    ),
    ...(summary.totalMeetingsSet === 0 ? ['No meetings booked in this period.'] : []),
  ].join('\n');
};

export const readReportSummary = async ({
  repository,
  period,
  now,
  timeZone,
}: {
  repository: OutreachRepository;
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): Promise<string> => {
  const window = getReportWindow({ period, now });
  const activities = await repository.listActivities({
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  });
  return formatReportSummary(
    buildReportSummary({ activities, period, now, timeZone }),
  );
};
