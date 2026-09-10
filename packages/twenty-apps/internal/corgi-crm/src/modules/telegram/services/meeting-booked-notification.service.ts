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
  name?: string | null;
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

export class MeetingBookedNotificationValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MeetingBookedNotificationValidationError';
  }
}

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

export type MeetingCanarySuppression = {
  namePrefix: string;
  notAfter: number;
};

// The release canary books a real meeting in production, which is precisely the
// transition this alert fires on. A run-scoped self-expiring token lets that one
// booking through without alerting, so a release no longer has to shut the whole
// bot off. The prefix shape is pinned to the canary's own naming scheme and the
// window is bounded, so an armed token can never suppress an arbitrary meeting.
const MEETING_CANARY_NAME_PREFIX_PATTERN =
  /^CRM meeting canary [1-9][0-9]*-[1-9][0-9]*-$/;
const MEETING_CANARY_SUPPRESSION_MAX_WINDOW_MS = 30 * 60_000;

export const parseMeetingCanarySuppression = (
  value: unknown,
  now: number,
): MeetingCanarySuppression | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const token = parsed as Record<string, unknown>;
  if (
    Object.keys(token).sort().join(',') !== 'namePrefix,notAfter,version' ||
    token.version !== 1 ||
    typeof token.namePrefix !== 'string' ||
    !MEETING_CANARY_NAME_PREFIX_PATTERN.test(token.namePrefix)
  ) {
    return null;
  }
  const notAfter = canonicalInstant(token.notAfter);
  if (!notAfter || notAfter !== token.notAfter || !Number.isFinite(now)) {
    return null;
  }
  const expiresAt = Date.parse(notAfter);
  if (
    expiresAt <= now ||
    expiresAt - now > MEETING_CANARY_SUPPRESSION_MAX_WINDOW_MS
  ) {
    return null;
  }
  return { namePrefix: token.namePrefix, notAfter: expiresAt };
};

// Fails open on every unparseable, expired or unmatched token: the worst case is
// one spurious canary alert, never a silenced genuine booking.
export const isSuppressedMeetingCanaryBooking = ({
  name,
  suppressionJson,
  now,
}: {
  name: unknown;
  suppressionJson: unknown;
  now: number;
}): boolean => {
  const suppression = parseMeetingCanarySuppression(suppressionJson, now);
  if (!suppression || typeof name !== 'string') return false;
  const normalized = name.trim();
  if (!normalized.startsWith(suppression.namePrefix)) return false;
  return UUID_PATTERN.test(normalized.slice(suppression.namePrefix.length));
};

export const parseMeetingBookedNotificationEvent = (
  value: unknown,
): MeetingBookedNotificationEvent => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MeetingBookedNotificationValidationError(
      'Invalid meeting booked notification event',
    );
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
    throw new MeetingBookedNotificationValidationError(
      'Invalid meeting booked notification event',
    );
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
    throw new MeetingBookedNotificationValidationError(
      'Invalid authoritative meeting booking for notification',
    );
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

export const meetingCanarySuppressionKey = (
  meetingId: string,
  bookedAt: string,
): string =>
  `telegram:meeting-canary-suppression:${createHash('sha256')
    .update(`meeting_booked:${meetingId}:${bookedAt}`)
    .digest('hex')}`;

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
      throw new MeetingBookedNotificationValidationError(
        'Meeting booked notification snapshot collision',
      );
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
