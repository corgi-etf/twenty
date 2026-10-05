import {
  type CorgiHomeQuery,
  type CorgiMoney,
  type CorgiRecordLink,
} from '@/corgi-crm/types/CorgiHome';
import { t } from '@lingui/core/macro';
import { formatInTimeZone } from 'date-fns-tz';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

export const CORGI_REPORTING_TIME_ZONE = 'America/Chicago';

export const getCorgiDateRange = (days: number, now: Date) => {
  const to = formatInTimeZone(now, CORGI_REPORTING_TIME_ZONE, 'yyyy-MM-dd');
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return { from: start.toISOString().slice(0, 10), to };
};

export const getCorgiRecordPath = (record: CorgiRecordLink) =>
  getAppPath(AppPath.RecordShowPage, {
    objectNameSingular: encodeURIComponent(record.objectNameSingular),
    objectRecordId: encodeURIComponent(record.id),
  });

export const getCorgiDrilldownPath = (query: CorgiHomeQuery) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value);
  });
  return `/home?${params.toString()}`;
};

export const formatCorgiMoney = (amounts: CorgiMoney[]) =>
  amounts
    .map(({ currencyCode, amountMicros }) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
      }).format(Number(amountMicros) / 1_000_000),
    )
    .join(' · ');

export const formatCorgiDateTime = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: CORGI_REPORTING_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));

export const getCorgiObjectLabel = (objectNameSingular: string) =>
  ({
    company: t`Company`,
    person: t`Person`,
    wholesaler: t`Wholesaler`,
    outreachActivity: t`Outreach activity`,
    meetingBooking: t`Meeting`,
    companyAllocation: t`Allocation`,
    leadAssignment: t`Lead assignment`,
    outreachFollowUp: t`Follow-up`,
    task: t`Task`,
    note: t`Note`,
  })[objectNameSingular] ?? t`Record`;

export const getCorgiSectionLabel = (
  section: NonNullable<CorgiHomeQuery['section']>,
) =>
  ({
    activities: t`Activities`,
    meetingsSet: t`Meetings set`,
    meetingsTaken: t`Meetings taken`,
    allocations: t`Allocations`,
    currentClients: t`Current clients`,
    followUps: t`Follow-ups`,
    followUpCompanies: t`Follow-up companies`,
    agenda: t`Meeting agenda`,
    team: t`Team performance`,
    trends: t`Activity trends`,
    activeClients: t`Clients marked active`,
    liveWins: t`Notification history`,
    latestRecords: t`Latest saved records`,
  })[section] ?? t`Records`;

export const getCorgiFollowUpTiming = (
  dueAt: string,
  now: Date,
): 'overdue' | 'due-today' | 'upcoming' => {
  const dueDate = formatInTimeZone(
    dueAt,
    CORGI_REPORTING_TIME_ZONE,
    'yyyy-MM-dd',
  );
  const today = formatInTimeZone(now, CORGI_REPORTING_TIME_ZONE, 'yyyy-MM-dd');
  return dueDate < today
    ? 'overdue'
    : dueDate === today
      ? 'due-today'
      : 'upcoming';
};
