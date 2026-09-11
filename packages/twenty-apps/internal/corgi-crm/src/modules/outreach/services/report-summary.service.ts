import { EXTERNAL_WHOLESALER_ROLE } from 'src/constants';
import {
  type MeetingBookingReportRepository,
  type ReportMeetingBooking,
} from 'src/modules/outreach/report-meeting-booking.types';
import { getLocalDayBoundaryWindow } from 'src/modules/outreach/services/day-window.service';
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
  leaderboard: LeaderboardGroup[];
  meetingsTakenByExternalWholesalers: ExternalWholesalerMeetingsSection;
  externalWholesalerRevenue: ExternalWholesalerRevenueSection;
};

export type ExternalWholesaler = {
  wholesalerId: string;
  name: string;
};

export type ExternalWholesalerMeetings = ExternalWholesaler & {
  meetings: number;
};

export type ExternalWholesalerRevenue = ExternalWholesaler & {
  attributedAnnualRecurringRevenue: number;
};

// 'unavailable' is an outcome, not an error: role data the report could not
// obtain degrades the sections built from it and must reach no other part of
// the report.
export type ExternalWholesalerDirectory =
  | { status: 'resolved'; wholesalers: ExternalWholesaler[] }
  | { status: 'unavailable' };

export type ExternalWholesalerMeetingsSection =
  | { status: 'resolved'; wholesalers: ExternalWholesalerMeetings[] }
  | { status: 'unavailable' };

export type ExternalWholesalerRevenueSection =
  | { status: 'resolved'; wholesalers: ExternalWholesalerRevenue[] }
  | { status: 'unavailable' };

export type OwnerCount = {
  ownerId: string;
  name: string;
  count: number;
  calls: number;
  emails: number;
  linkedin: number;
  meetingsSet: number;
};

// A null label is the degraded shape: with roles unreadable the report ranks
// everyone in one ungrouped list rather than filing people under a role nobody
// proved.
export type LeaderboardGroup = {
  label: 'BDR' | 'EW' | null;
  owners: OwnerCount[];
};

// The owner reports on a working day that starts at 5am local, not on a rolling
// 24 hours, so every period covers a whole number of these days.
export const REPORT_DAY_BOUNDARY_HOUR = 5;
const REPORT_DAYS: Record<ReportPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};
// The title says what the window actually is. "Last 24 hours" outlived the
// window it described, and a label that survives its subject is how a report
// starts lying to the people who trust it.
const REPORT_TITLES: Record<ReportPeriod, string> = {
  daily: 'Daily outreach report — 5am to 5am',
  weekly:
    'Weekly outreach report — 7 days, 5am to 5am, excluding Saturday/Sunday',
  monthly: 'Monthly outreach report — 30 days, 5am to 5am',
};

// The three ranked channels, keyed by the UPPER_CASE SELECT values the CRM
// stores. MEETING, OTHER and any value this app was never taught still count
// toward the total and simply fall outside the triple.
const ACTIVITY_CHANNELS: Record<string, 'calls' | 'emails' | 'linkedin'> = {
  PHONE_CALL: 'calls',
  EMAIL: 'emails',
  LINKEDIN: 'linkedin',
};

const cleanLabel = (value: string, fallback: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;

export const getReportWindow = ({
  period,
  now,
  timeZone,
}: {
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}) =>
  getLocalDayBoundaryWindow({
    now,
    timeZone,
    boundaryHour: REPORT_DAY_BOUNDARY_HOUR,
    days: REPORT_DAYS[period],
  });

const emptyOwner = (ownerId: string, name: string): OwnerCount => ({
  ownerId,
  name,
  count: 0,
  calls: 0,
  emails: 0,
  linkedin: 0,
  meetingsSet: 0,
});

// Activities and bookings share one owner row, so someone who booked a meeting
// without logging an activity is still counted rather than dropped.
const addOwnerRow = (
  owners: Map<string, OwnerCount>,
  record: { wholesalerId: string; wholesalerName: string },
): OwnerCount => {
  const ownerId = record.wholesalerId.trim() || 'unassigned';
  const name = cleanLabel(record.wholesalerName, 'Unassigned');
  const owner = owners.get(ownerId);
  if (!owner) {
    const created = emptyOwner(ownerId, name);
    owners.set(ownerId, created);
    return created;
  }
  // Owner labels can differ between query pages; retain a stable choice.
  if (name.localeCompare(owner.name, 'en') < 0) owner.name = name;
  return owner;
};

// No system attributes revenue to a wholesaler yet, so every EW reads the same
// figure; wiring a real source replaces this single reader.
export const PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE = 0;

const ACTIVITY_LEADERBOARD_HEADING =
  '🏆 Activity leaderboard (calls/emails/linkedin)';
const EXTERNAL_WHOLESALER_MEETINGS_HEADING = 'Meetings taken by EW';
const EXTERNAL_WHOLESALER_REVENUE_HEADING = 'ARR attributed per EW';
// True whether nobody carries the role or an EW simply did nothing in the
// window -- the EW set is derived from who appears in this report.
const NO_EXTERNAL_WHOLESALER_MEETINGS_NOTE =
  'No wholesaler with the EW role appears in this period.';
const NO_EXTERNAL_WHOLESALER_NOTE =
  'No wholesaler with the EW role appears in this period, so there is nothing to attribute.';
const EXTERNAL_WHOLESALER_MEETINGS_UNAVAILABLE_NOTE =
  'Wholesaler roles could not be read for this report, so meetings taken by EW are unavailable.';
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

const compareExternalWholesalers = (
  left: ExternalWholesaler,
  right: ExternalWholesaler,
) =>
  left.name.localeCompare(right.name, 'en') ||
  left.wholesalerId.localeCompare(right.wholesalerId, 'en');

export const buildExternalWholesalerDirectory = (
  wholesalerRoles: WholesalerRecord[],
): ExternalWholesalerDirectory => {
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
      }))
      .sort(compareExternalWholesalers),
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
// same degraded directory and the rest of the report is unaffected.
export const readExternalWholesalerDirectory = async ({
  wholesalerRoleReader,
  activities,
  meetingBookings,
}: {
  wholesalerRoleReader: WholesalerRoleReader | undefined;
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
}): Promise<ExternalWholesalerDirectory> => {
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
    return buildExternalWholesalerDirectory(wholesalerRoles);
  } catch {
    // Swallowed on purpose: see above. No error detail is rendered either --
    // this text is delivered to a Telegram group.
    return { status: 'unavailable' };
  }
};

// The owner ranks on meetings set. Activities break the tie because they are
// the other thing the row reports, then name and ID make the order total, so
// the same data always renders in the same order.
const compareOwners = (left: OwnerCount, right: OwnerCount) =>
  right.meetingsSet - left.meetingsSet ||
  right.count - left.count ||
  left.name.localeCompare(right.name, 'en') ||
  left.ownerId.localeCompare(right.ownerId, 'en');

// Everyone the report saw is ranked. A wholesaler whose role is neither BDR nor
// EW -- unset, the legacy default, or a word this app was never taught --
// belongs to the BDR group instead of disappearing from the leaderboard.
const buildLeaderboard = (
  owners: OwnerCount[],
  externalWholesalers: ExternalWholesalerDirectory,
): LeaderboardGroup[] => {
  const ranked = [...owners].sort(compareOwners);
  if (externalWholesalers.status !== 'resolved') {
    return [{ label: null, owners: ranked }];
  }
  const externalIds = new Set(
    externalWholesalers.wholesalers.map(({ wholesalerId }) => wholesalerId),
  );
  return [
    {
      label: 'BDR' as const,
      owners: ranked.filter(({ ownerId }) => !externalIds.has(ownerId)),
    },
    {
      label: 'EW' as const,
      owners: ranked.filter(({ ownerId }) => externalIds.has(ownerId)),
    },
  ].filter(({ owners: groupOwners }) => groupOwners.length > 0);
};

// A meeting booking carries one owner, so a meeting is taken by the EW it
// belongs to. Nothing the report reads records a second person on a meeting.
const buildExternalWholesalerMeetings = (
  owners: Map<string, OwnerCount>,
  externalWholesalers: ExternalWholesalerDirectory,
): ExternalWholesalerMeetingsSection => {
  if (externalWholesalers.status !== 'resolved') {
    return { status: 'unavailable' };
  }
  return {
    status: 'resolved',
    wholesalers: externalWholesalers.wholesalers
      .map(({ wholesalerId, name }) => {
        const owner = owners.get(wholesalerId);
        return {
          wholesalerId,
          // The label the rest of the report already shows for this person.
          name: owner?.name ?? name,
          meetings: owner?.meetingsSet ?? 0,
        };
      })
      .sort(
        (left, right) =>
          right.meetings - left.meetings ||
          compareExternalWholesalers(left, right),
      ),
  };
};

const buildExternalWholesalerRevenue = (
  owners: Map<string, OwnerCount>,
  externalWholesalers: ExternalWholesalerDirectory,
): ExternalWholesalerRevenueSection => {
  if (externalWholesalers.status !== 'resolved') {
    return { status: 'unavailable' };
  }
  return {
    status: 'resolved',
    wholesalers: externalWholesalers.wholesalers
      .map(({ wholesalerId, name }) => ({
        wholesalerId,
        name: owners.get(wholesalerId)?.name ?? name,
        attributedAnnualRecurringRevenue:
          PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE,
      }))
      .sort(
        (left, right) =>
          right.attributedAnnualRecurringRevenue -
            left.attributedAnnualRecurringRevenue ||
          compareExternalWholesalers(left, right),
      ),
  };
};

export const buildReportSummary = ({
  activities,
  meetingBookings,
  externalWholesalers,
  period,
  now,
  timeZone,
}: {
  activities: OutreachActivity[];
  meetingBookings: ReportMeetingBooking[];
  externalWholesalers?: ExternalWholesalerDirectory;
  period: ReportPeriod;
  now: Date;
  timeZone: string;
}): ReportSummary => {
  if (!Array.isArray(meetingBookings)) {
    throw new Error('Meeting booking report data is unavailable');
  }
  const { start, end } = getReportWindow({ period, now, timeZone });
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
    if (!isIncluded(activity.occurredAt) || seenIds.has(activity.id)) continue;
    seenIds.add(activity.id);
    const owner = addOwnerRow(owners, activity);
    owner.count += 1;
    // Matched case-insensitively and trimmed: rows written before activityType
    // became a SELECT still carry the lower snake_case value, and both
    // spellings have to reach the same bucket for as long as both exist.
    const channel =
      ACTIVITY_CHANNELS[(activity.activityType ?? '').trim().toUpperCase()];
    if (channel) owner[channel] += 1;
  }

  for (const booking of meetingBookings) {
    if (!isIncluded(booking.bookedAt) || seenBookingIds.has(booking.id))
      continue;
    seenBookingIds.add(booking.id);
    addOwnerRow(owners, booking).meetingsSet += 1;
  }

  // An absent directory means the role data was never obtained, never "no EW".
  const directory: ExternalWholesalerDirectory = externalWholesalers ?? {
    status: 'unavailable',
  };

  return {
    period,
    timeZone,
    start,
    end,
    total: seenIds.size,
    totalMeetingsSet: seenBookingIds.size,
    leaderboard: buildLeaderboard([...owners.values()], directory),
    meetingsTakenByExternalWholesalers: buildExternalWholesalerMeetings(
      owners,
      directory,
    ),
    externalWholesalerRevenue: buildExternalWholesalerRevenue(
      owners,
      directory,
    ),
  };
};

const formatRank = (index: number) =>
  ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;

const formatExternalWholesalerMeetings = (
  section: ExternalWholesalerMeetingsSection,
): string[] => {
  if (section.status !== 'resolved') {
    return [EXTERNAL_WHOLESALER_MEETINGS_UNAVAILABLE_NOTE];
  }
  if (section.wholesalers.length === 0) {
    return [NO_EXTERNAL_WHOLESALER_MEETINGS_NOTE];
  }
  return section.wholesalers.map(
    ({ name, meetings }, index) => `${formatRank(index)} ${name}: ${meetings}`,
  );
};

const formatExternalWholesalerRevenue = (
  section: ExternalWholesalerRevenueSection,
): string[] => {
  if (section.status !== 'resolved') {
    return [EXTERNAL_WHOLESALER_ROLE_UNAVAILABLE_NOTE];
  }
  if (section.wholesalers.length === 0) return [NO_EXTERNAL_WHOLESALER_NOTE];
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return section.wholesalers.map(
    ({ name, attributedAnnualRecurringRevenue }, index) =>
      `${formatRank(index)} ${name}: ${money.format(attributedAnnualRecurringRevenue)}`,
  );
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
  const formatMeetings = (count: number) =>
    `${count} ${count === 1 ? 'meeting' : 'meetings'} set`;

  return [
    `🎉 ${REPORT_TITLES[summary.period]}`,
    `${timestamp.format(summary.start)} → ${timestamp.format(summary.end)} (${summary.timeZone})`,
    'All CRM owners',
    '',
    `📊 Total activities: ${summary.total}`,
    `📅 Meetings set: ${summary.totalMeetingsSet}`,
    '',
    ACTIVITY_LEADERBOARD_HEADING,
    ...summary.leaderboard.flatMap(({ label, owners }) => [
      ...(label ? [label] : []),
      ...owners.map(
        ({ name, calls, emails, linkedin, meetingsSet }, index) =>
          `${formatRank(index)} ${name}: (${calls}/${emails}/${linkedin}) · ${formatMeetings(meetingsSet)}`,
      ),
    ]),
    ...(summary.total === 0 ? ['No outreach logged in this period.'] : []),
    ...(summary.totalMeetingsSet === 0
      ? ['No meetings booked in this period.']
      : []),
    '',
    // Both EW sections are always rendered, in all three states: a section that
    // disappears when role data is missing reads as a bug, and the report has
    // to say which it is.
    EXTERNAL_WHOLESALER_MEETINGS_HEADING,
    ...formatExternalWholesalerMeetings(
      summary.meetingsTakenByExternalWholesalers,
    ),
    '',
    EXTERNAL_WHOLESALER_REVENUE_HEADING,
    ...formatExternalWholesalerRevenue(summary.externalWholesalerRevenue),
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
  const window = getReportWindow({ period, now, timeZone });
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
  const externalWholesalers = await readExternalWholesalerDirectory({
    wholesalerRoleReader,
    activities,
    meetingBookings,
  });
  return formatReportSummary(
    buildReportSummary({
      activities,
      meetingBookings,
      externalWholesalers,
      period,
      now,
      timeZone,
    }),
  );
};
