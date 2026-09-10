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
  type WholesalerRoleReader,
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
  externalWholesalerRevenue: ExternalWholesalerRevenueSection;
};

export type ExternalWholesalerRevenue = {
  wholesalerId: string;
  name: string;
  attributedAnnualRecurringRevenue: number;
};

// 'unavailable' is an outcome, not an error: role data the report could not
// obtain degrades this section and must reach no other part of the report.
export type ExternalWholesalerRevenueSection =
  | { status: 'resolved'; wholesalers: ExternalWholesalerRevenue[] }
  | { status: 'unavailable' };

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

// No system attributes revenue to a wholesaler yet, so every EW reads the same
// figure; wiring a real source replaces this single reader.
export const PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE = 0;

const EXTERNAL_WHOLESALER_REVENUE_HEADING = '💰 ARR attributed per EW';
const EXTERNAL_WHOLESALER_REVENUE_ZERO_NOTE =
  'No ARR source is connected yet, so every figure reads $0.';
// True whether nobody carries the role or an EW simply did nothing in the
// window -- the EW set is derived from who appears in this report.
const NO_EXTERNAL_WHOLESALER_NOTE =
  'No wholesaler with the EW role appears in this period, so there is nothing to attribute.';
const EXTERNAL_WHOLESALER_ROLE_UNAVAILABLE_NOTE =
  'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.';

// A read that never returns is the one failure a catch cannot see, and the
// report is produced inside a 60-second logic function, so the role read gets
// its own budget and degrades when it runs out.
const EXTERNAL_WHOLESALER_ROLE_READ_TIMEOUT_MILLISECONDS = 8_000;

// wholesalerRole is hand-entered, so casing and stray spacing decide nothing.
// Only an exact normalized match identifies the role: an empty value, the
// legacy 'Wholesaler' default every record still carries, or any word this app
// has never been taught stays unidentified rather than becoming a guess.
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

const isNullableString = (value: unknown) =>
  value === null || value === undefined || typeof value === 'string';

const isWholesalerRoleRecord = (record: WholesalerRecord) =>
  Boolean(record) &&
  typeof record === 'object' &&
  typeof record.id === 'string' &&
  record.id.trim() !== '' &&
  isNullableString(record.name) &&
  isNullableString(record.wholesalerRole);

export const buildExternalWholesalerRevenueSection = (
  wholesalerRoles: WholesalerRecord[],
): ExternalWholesalerRevenueSection => {
  // A roster that is not a well-formed list of wholesalers is a failed read,
  // never a truthful "nobody carries the EW role".
  if (
    !Array.isArray(wholesalerRoles) ||
    !wholesalerRoles.every(isWholesalerRoleRecord)
  ) {
    return { status: 'unavailable' };
  }
  return {
    status: 'resolved',
    wholesalers: wholesalerRoles
      .filter((record) => isExternalWholesalerRole(record.wholesalerRole))
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
      ),
  };
};

// The report already knows who acted in the window, so the role read is bounded
// by that set instead of reading the whole roster. The deliberate cost is that
// an EW with neither an activity nor a booking in the period does not appear.
const collectWholesalerIds = (
  activities: OutreachActivity[],
  meetingBookings: ReportMeetingBooking[],
): string[] => {
  const wholesalerIds = new Set<string>();
  for (const source of [activities, meetingBookings]) {
    if (!Array.isArray(source)) continue;
    for (const record of source) {
      const wholesalerId = record?.wholesalerId;
      if (typeof wholesalerId === 'string' && wholesalerId.trim()) {
        wholesalerIds.add(wholesalerId.trim());
      }
    }
  }
  return [...wholesalerIds];
};

const withReadBudget = <TValue>(
  read: Promise<TValue>,
  milliseconds: number,
): Promise<TValue> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    read,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Wholesaler role read exceeded its budget')),
        milliseconds,
      );
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
};

// Nothing here may reject. An unreadable wholesaler role once made
// readReportSummary throw, which failed the installed-report runtime
// verification and deleted the live Telegram webhook. Every failure mode --
// a rejection, malformed data, or a read that never returns -- lands on the
// same degraded section and the rest of the report is unaffected.
export const readExternalWholesalerRevenue = async ({
  wholesalerRoleReader,
  activities,
  meetingBookings,
}: {
  wholesalerRoleReader: WholesalerRoleReader | undefined;
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
}): Promise<ExternalWholesalerRevenueSection> => {
  if (!wholesalerRoleReader) return { status: 'unavailable' };
  try {
    const wholesalerIds = collectWholesalerIds(activities, meetingBookings);
    if (wholesalerIds.length === 0) {
      return { status: 'resolved', wholesalers: [] };
    }
    const wholesalerRoles = await withReadBudget(
      wholesalerRoleReader.findRolesByIds(wholesalerIds),
      EXTERNAL_WHOLESALER_ROLE_READ_TIMEOUT_MILLISECONDS,
    );
    return buildExternalWholesalerRevenueSection(wholesalerRoles);
  } catch {
    // Swallowed on purpose: see above. No error detail is rendered either --
    // this text is delivered to a Telegram group.
    return { status: 'unavailable' };
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
  externalWholesalerRevenue,
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
  externalWholesalerRevenue?: ExternalWholesalerRevenueSection;
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
    // An absent section means the role data was never obtained, never "no EW".
    externalWholesalerRevenue: externalWholesalerRevenue ?? {
      status: 'unavailable',
    },
  };
};

const formatExternalWholesalerRevenue = (
  section: ExternalWholesalerRevenueSection | undefined,
): string[] => {
  if (section?.status !== 'resolved') {
    return [EXTERNAL_WHOLESALER_ROLE_UNAVAILABLE_NOTE];
  }
  if (section.wholesalers.length === 0) return [NO_EXTERNAL_WHOLESALER_NOTE];
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  // Summed from the same figures printed above rather than stated separately,
  // so the total cannot disagree with its parts once a real ARR source
  // replaces the placeholder.
  const total = section.wholesalers.reduce(
    (running, { attributedAnnualRecurringRevenue }) =>
      running + attributedAnnualRecurringRevenue,
    0,
  );
  // Ranked by ARR, then by name so the order is stable while every figure is
  // the same placeholder zero -- otherwise the list would reshuffle between
  // reports for no reason the reader can see.
  const ranked = [...section.wholesalers].sort(
    (left, right) =>
      right.attributedAnnualRecurringRevenue -
        left.attributedAnnualRecurringRevenue ||
      left.name.localeCompare(right.name),
  );

  return [
    EXTERNAL_WHOLESALER_REVENUE_ZERO_NOTE,
    ...ranked.map(
      ({ name, attributedAnnualRecurringRevenue }, index) =>
        `${index + 1}. ${name}: ${money.format(attributedAnnualRecurringRevenue)}`,
    ),
    `Total ARR: ${money.format(total)}`,
  ];
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
    // ARR leads the report: it is the figure the desk is measured on, so it
    // should not sit below a leaderboard the reader has to scroll past.
    EXTERNAL_WHOLESALER_REVENUE_HEADING,
    ...formatExternalWholesalerRevenue(summary.externalWholesalerRevenue),
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
  wholesalerRoleReader,
  period,
  now,
  timeZone,
}: {
  repository: Pick<OutreachRepository, 'listActivities'>;
  meetingRepository: MeetingBookingReportRepository;
  wholesalerRoleReader?: WholesalerRoleReader;
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
  // Sequenced after the two reads on purpose: the role read is scoped to the
  // wholesalers those reads already returned, so it never grows with the roster.
  const externalWholesalerRevenue = await readExternalWholesalerRevenue({
    wholesalerRoleReader,
    activities,
    meetingBookings,
  });
  return formatReportSummary(
    buildReportSummary({
      activities,
      meetingBookings,
      externalWholesalerRevenue,
      period,
      now,
      timeZone,
    }),
  );
};
