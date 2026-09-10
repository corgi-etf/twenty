import { type SummaryCount } from 'src/modules/outreach/services/daily-summary.service';
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
  activityCounts: SummaryCount[];
  outcomeCounts: SummaryCount[];
  leaderboard: Array<{ ownerId: string; name: string; count: number }>;
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

const sortedCounts = (counts: Map<string, number>): SummaryCount[] =>
  [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));

export const buildReportSummary = ({
  activities,
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
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
  const owners = new Map<
    string,
    { ownerId: string; name: string; count: number }
  >();
  const seenIds = new Set<string>();

  for (const activity of activities) {
    const occurredAt = new Date(activity.occurredAt);
    if (!(occurredAt >= start && occurredAt < end) || seenIds.has(activity.id))
      continue;
    if (
      period === 'weekly' &&
      ['Sat', 'Sun'].includes(weekday.format(occurredAt))
    )
      continue;
    seenIds.add(activity.id);

    const activityType = cleanLabel(activity.activityType, 'Unspecified');
    const outcome = cleanLabel(activity.outcome, 'Unspecified');
    activityCounts.set(
      activityType,
      (activityCounts.get(activityType) ?? 0) + 1,
    );
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);

    const ownerId = activity.wholesalerId.trim() || 'unassigned';
    const name = cleanLabel(activity.wholesalerName, 'Unassigned');
    const owner = owners.get(ownerId);
    if (owner) {
      owner.count += 1;
      // The same owner can appear with an older label on another query page.
      if (name.localeCompare(owner.name, 'en') < 0) owner.name = name;
    } else {
      owners.set(ownerId, { ownerId, name, count: 1 });
    }
  }

  return {
    period,
    timeZone,
    start,
    end,
    total: seenIds.size,
    activityCounts: sortedCounts(activityCounts),
    outcomeCounts: sortedCounts(outcomeCounts),
    leaderboard: [...owners.values()].sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, 'en') ||
        left.ownerId.localeCompare(right.ownerId, 'en'),
    ),
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
  const formatCounts = (counts: SummaryCount[]) =>
    counts.map(({ label, count }) => `${label}: ${count}`).join(', ') || 'None';

  return [
    REPORT_TITLES[summary.period],
    `${timestamp.format(summary.start)} → ${timestamp.format(summary.end)} (${summary.timeZone})`,
    'All CRM owners',
    `Total activities: ${summary.total}`,
    `By activity: ${formatCounts(summary.activityCounts)}`,
    `By outcome: ${formatCounts(summary.outcomeCounts)}`,
    'Leaderboard:',
    ...summary.leaderboard.map(
      ({ name, count }, index) => `${index + 1}. ${name}: ${count}`,
    ),
    ...(summary.total === 0 ? ['No outreach logged in this period.'] : []),
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
