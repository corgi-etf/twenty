import { type OutreachActivity } from 'src/modules/outreach/types';

export type SummaryCount = { label: string; count: number };

export type DailySummary = {
  wholesalerId: string;
  wholesalerName: string;
  localDate: string;
  total: number;
  activityCounts: SummaryCount[];
  outcomeCounts: SummaryCount[];
  activities: OutreachActivity[];
};

const counts = (
  activities: OutreachActivity[],
  select: (activity: OutreachActivity) => string,
): SummaryCount[] =>
  [...activities.reduce((map, activity) => {
    const label = select(activity).trim() || 'Unspecified';
    map.set(label, (map.get(label) ?? 0) + 1);
    return map;
  }, new Map<string, number>())]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));

export const buildDailySummaries = (
  activities: OutreachActivity[],
  localDate: string,
): DailySummary[] => {
  const grouped = new Map<string, OutreachActivity[]>();
  for (const activity of activities) {
    const group = grouped.get(activity.wholesalerId) ?? [];
    group.push(activity);
    grouped.set(activity.wholesalerId, group);
  }

  return [...grouped.entries()]
    .map(([wholesalerId, groupedActivities]) => {
      const sorted = [...groupedActivities].sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.id.localeCompare(right.id),
      );
      return {
        wholesalerId,
        wholesalerName: sorted[0]?.wholesalerName.trim() || 'Team member',
        localDate,
        total: sorted.length,
        activityCounts: counts(sorted, ({ activityType }) => activityType),
        outcomeCounts: counts(sorted, ({ outcome }) => outcome),
        activities: sorted,
      };
    })
    .sort(
      (left, right) =>
        left.wholesalerName.localeCompare(right.wholesalerName) ||
        left.wholesalerId.localeCompare(right.wholesalerId),
    );
};

export const formatDailySummary = (summary: DailySummary): string => {
  const formatCounts = (values: SummaryCount[]) =>
    values.map(({ label, count }) => `${label}: ${count}`).join(', ');
  const activityLines = summary.activities.map((activity) => {
    const contact = activity.contactName ? ` / ${activity.contactName}` : '';
    return `• ${activity.activityType} — ${activity.companyName}${contact} — ${activity.outcome}`;
  });

  return [
    `${summary.wholesalerName} — ${summary.localDate}`,
    `Total: ${summary.total}`,
    `By activity: ${formatCounts(summary.activityCounts) || 'None'}`,
    `By outcome: ${formatCounts(summary.outcomeCounts) || 'None'}`,
    ...activityLines,
  ].join('\n');
};

export const formatEmptyDailySummary = (
  wholesalerName: string,
  localDate: string,
): string => `${wholesalerName} — ${localDate}\nTotal: 0\nNo outreach logged.`;
