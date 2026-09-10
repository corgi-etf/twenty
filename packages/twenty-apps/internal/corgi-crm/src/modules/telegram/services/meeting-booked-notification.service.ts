import { createHash } from 'node:crypto';

import { type KeyValueStore } from 'src/modules/telegram/types';

export type MeetingBookedNotificationEvent = {
  type: 'meeting_booked';
  meetingId: string;
  bookedAt: string;
  scheduledAt: string;
  riaName: string;
  ownerName: string;
  bookedByName?: string;
};

export type MeetingBookingNotificationSource = {
  id?: string | null;
  status?: string | null;
  bookedAt?: string | null;
  scheduledAt?: string | null;
  company?: { id?: string | null; name?: string | null } | null;
  wholesaler?: { id?: string | null; name?: string | null } | null;
  bookedBy?: {
    id?: string | null;
    name?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 500;

const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const canonicalInstant = (value: unknown): string | null => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
};

const validName = (value: string) =>
  value.length > 0 && value.length <= MAX_NAME_LENGTH;

export const parseMeetingBookedNotificationEvent = (
  value: unknown,
): MeetingBookedNotificationEvent => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid meeting booked notification event');
  }
  const event = value as Record<string, unknown>;
  const allowedKeys = event.bookedByName === undefined
    ? 'bookedAt,meetingId,ownerName,riaName,scheduledAt,type'
    : 'bookedAt,bookedByName,meetingId,ownerName,riaName,scheduledAt,type';
  const bookedAt = canonicalInstant(event.bookedAt);
  const scheduledAt = canonicalInstant(event.scheduledAt);
  const riaName = normalizeName(event.riaName);
  const ownerName = normalizeName(event.ownerName);
  const bookedByName = normalizeName(event.bookedByName);
  if (
    Object.keys(event).sort().join(',') !== allowedKeys ||
    event.type !== 'meeting_booked' ||
    typeof event.meetingId !== 'string' ||
    !UUID_PATTERN.test(event.meetingId) ||
    !bookedAt ||
    bookedAt !== event.bookedAt ||
    !scheduledAt ||
    scheduledAt !== event.scheduledAt ||
    !validName(riaName) ||
    !validName(ownerName) ||
    (event.bookedByName !== undefined && !validName(bookedByName))
  ) {
    throw new Error('Invalid meeting booked notification event');
  }
  return {
    type: 'meeting_booked',
    meetingId: event.meetingId,
    bookedAt,
    scheduledAt,
    riaName,
    ownerName,
    ...(bookedByName ? { bookedByName } : {}),
  };
};

const buildEvent = (
  booking: MeetingBookingNotificationSource | null,
  meetingId: string,
  bookedAt: string,
): MeetingBookedNotificationEvent => {
  const expectedBookedAt = canonicalInstant(bookedAt);
  const actualBookedAt = canonicalInstant(booking?.bookedAt);
  const scheduledAt = canonicalInstant(booking?.scheduledAt);
  const riaName = normalizeName(booking?.company?.name);
  const ownerName = normalizeName(booking?.wholesaler?.name);
  const bookedByName = normalizeName(
    [booking?.bookedBy?.name?.firstName, booking?.bookedBy?.name?.lastName]
      .filter(Boolean)
      .join(' '),
  );
  if (
    !booking ||
    booking.id !== meetingId ||
    booking.status !== 'BOOKED' ||
    !expectedBookedAt ||
    actualBookedAt !== expectedBookedAt ||
    !scheduledAt ||
    !UUID_PATTERN.test(booking.company?.id ?? '') ||
    !UUID_PATTERN.test(booking.wholesaler?.id ?? '') ||
    !validName(riaName) ||
    !validName(ownerName) ||
    (bookedByName && !validName(bookedByName))
  ) {
    throw new Error('Invalid authoritative meeting booking for notification');
  }
  return {
    type: 'meeting_booked',
    meetingId,
    bookedAt: expectedBookedAt,
    scheduledAt,
    riaName,
    ownerName,
    ...(bookedByName ? { bookedByName } : {}),
  };
};

const snapshotKey = (meetingId: string, bookedAt: string) =>
  `telegram:notification-event:${createHash('sha256')
    .update(`meeting_booked:${meetingId}:${bookedAt}`)
    .digest('hex')}`;

export const readMeetingBookedNotificationSnapshot = async ({
  meetingId,
  bookedAt,
  store,
  readMeetingBooking,
}: {
  meetingId: string;
  bookedAt: string;
  store: KeyValueStore;
  readMeetingBooking(
    meetingId: string,
  ): Promise<MeetingBookingNotificationSource | null>;
}): Promise<MeetingBookedNotificationEvent> => {
  const key = snapshotKey(meetingId, bookedAt);
  const existing = await store.get(key);
  if (existing !== null) {
    const parsed = parseMeetingBookedNotificationEvent(existing);
    if (parsed.meetingId !== meetingId || parsed.bookedAt !== bookedAt) {
      throw new Error('Meeting booked notification snapshot collision');
    }
    return parsed;
  }
  const event = buildEvent(
    await readMeetingBooking(meetingId),
    meetingId,
    bookedAt,
  );
  await store.set(key, event);
  return event;
};

const formatInstant = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));

export const assertIanaTimeZone = (timeZone: string): void => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('Invalid Telegram notification time zone');
  }
};

export const formatMeetingBookedNotification = (
  input: MeetingBookedNotificationEvent,
  timeZone: string,
): string => {
  const event = parseMeetingBookedNotificationEvent(input);
  assertIanaTimeZone(timeZone);
  return [
    '🎉 NEW MEETING BOOKED! 🎉',
    '',
    `RIA: ${event.riaName}`,
    `Date: ${formatInstant(event.scheduledAt, timeZone)}`,
    `Owner: ${event.ownerName}`,
    `Booked: ${formatInstant(event.bookedAt, timeZone)}`,
    ...(event.bookedByName ? [`Booked by: ${event.bookedByName}`] : []),
  ].join('\n');
};
