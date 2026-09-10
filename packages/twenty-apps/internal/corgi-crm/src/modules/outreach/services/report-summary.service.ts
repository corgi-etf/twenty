import { EXTERNAL_WHOLESALER_ROLE } from 'src/constants';
import {
  type MeetingBookingReportRepository,
  type ReportMeetingBooking,
} from 'src/modules/outreach/report-meeting-booking.types';
import {
  type OutreachActivity,
  type OutreachRepository,
} from 'src/modules/outreach/types';
import {
  type WholesalerRecord,
  type WholesalerRepository,
} from 'src/modules/wholesaler/onboarding/types';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export type ReportSummary = {
  period: ReportPeriod;
  timeZone: string;
  start: Date;
  end: Date;
  total: number;
  totalMeetingsSet: number;
  leaderboard: OwnerCount[];
  externalWholesalerRevenue: ExternalWholesalerRevenue[];
};

export type ExternalWholesalerRevenue = {
  wholesalerId: string;
  name: string;
  attributedAnnualRecurringRevenue: number;
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

// The only ARR placeholder in the report: no system attributes revenue to a
// wholesaler yet, so swapping this single reader for a real lookup is all a
// future ARR source needs.
export const PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE = 0;

// wholesalerRole is human-entered, so casing and stray spacing decide nothing.
const normalizeRole = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const NORMALIZED_EXTERNAL_WHOLESALER_ROLE = normalizeRole(
  EXTERNAL_WHOLESALER_ROLE,
);

const isExternalWholesalerRole = (value: string | null | undefined) =>
  normalizeRole(value) === NORMALIZED_EXTERNAL_WHOLESALER_ROLE;

const buildExternalWholesalerRevenue = (
  wholesalers: WholesalerRecord[],
): ExternalWholesalerRevenue[] =>
  wholesalers
    .filter(({ wholesalerRole }) => isExternalWholesalerRole(wholesalerRole))
    .map(({ id, name }) => ({
      wholesalerId: id,
      name: cleanLabel(name ?? '', 'Unnamed external wholesaler'),
      attributedAnnualRecurringRevenue:
        PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, 'en') ||
        left.wholesalerId.localeCompare(right.wholesalerId, 'en'),
    );

const compareOwners = (left: OwnerCount, right: OwnerCount) =>
  right.count - left.count ||
  right.meetingsSet - left.meetingsSet ||
  left.name.localeCompare(right.name, 'en') ||
  left.ownerId.localeCompare(right.ownerId, 'en');

export const buildReportSummary = ({
  activities,
  meetingBookings,
  wholesalers,
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
  wholesalers: WholesalerRecord[];
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): ReportSummary => {
  if (!Array.isArray(meetingBookings)) {
    throw new Error('Meeting booking report data is unavailable');
  }
  // A failed roster read must not be reported as "no EW yet".
  if (!Array.isArray(wholesalers)) {
    throw new Error('Wholesaler role data is unavailable');
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
    externalWholesalerRevenue: buildExternalWholesalerRevenue(wholesalers),
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
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

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
    '',
    // Kept visible with an explanation when nobody is marked EW: the role is
    // still being populated, and a silently missing section reads as a bug.
    '💰 ARR attributed per EW',
    ...(summary.externalWholesalerRevenue.length
      ? [
          'No ARR source is connected yet, so every figure reads $0.',
          ...summary.externalWholesalerRevenue.map(
            ({ name, attributedAnnualRecurringRevenue }) =>
              `• ${name}: ${money.format(attributedAnnualRecurringRevenue)}`,
          ),
        ]
      : [
          'No wholesaler has the EW role yet, so there is nothing to attribute.',
        ]),
  ].join('\n');
};

export const readReportSummary = async ({
  repository,
  meetingRepository,
  wholesalerRepository,
  period,
  now,
  timeZone,
}: {
  repository: Pick<OutreachRepository, 'listActivities'>;
  meetingRepository: MeetingBookingReportRepository;
  wholesalerRepository: Pick<WholesalerRepository, 'listWholesalers'>;
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): Promise<string> => {
  const window = getReportWindow({ period, now });
  const input = {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  };
  const [activities, meetingBookings, wholesalers] = await Promise.all([
    repository.listActivities(input),
    meetingRepository.listMeetingBookings(input),
    wholesalerRepository.listWholesalers(),
  ]);
  return formatReportSummary(
    buildReportSummary({
      activities,
      meetingBookings,
      wholesalers,
      period,
      now,
      timeZone,
    }),
  );
};
