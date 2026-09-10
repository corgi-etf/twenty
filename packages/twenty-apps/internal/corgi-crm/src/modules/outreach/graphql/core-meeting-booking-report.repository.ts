import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type MeetingBookingReportRepository,
  type ReportMeetingBooking,
} from 'src/modules/outreach/report-meeting-booking.types';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Meeting booking report returned malformed data');
  }
  return value as Record<string, unknown>;
};

const optionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error('Meeting booking report returned a malformed field');
  }
  return value.trim() || undefined;
};

const parseBooking = (value: unknown): ReportMeetingBooking => {
  const node = record(value);
  const id = optionalString(node.id);
  const bookedAt = optionalString(node.bookedAt);
  const scheduledAt = optionalString(node.scheduledAt);
  if (
    !id ||
    !bookedAt ||
    !Number.isFinite(Date.parse(bookedAt)) ||
    (scheduledAt && !Number.isFinite(Date.parse(scheduledAt)))
  ) {
    throw new Error('Meeting booking report returned an invalid identity or timestamp');
  }
  const wholesaler =
    node.wholesaler === null || node.wholesaler === undefined
      ? undefined
      : record(node.wholesaler);
  const foreignOwnerId = optionalString(node.wholesalerId);
  const relatedOwnerId = optionalString(wholesaler?.id);
  if (foreignOwnerId && relatedOwnerId && foreignOwnerId !== relatedOwnerId) {
    throw new Error('Meeting booking report returned conflicting owner identities');
  }
  const ownerId = foreignOwnerId || relatedOwnerId;
  return {
    id,
    bookedAt,
    ...(scheduledAt ? { scheduledAt } : {}),
    wholesalerId: ownerId || 'unassigned',
    wholesalerName:
      optionalString(wholesaler?.name) ||
      (ownerId ? `Unassigned (${ownerId})` : 'Unassigned'),
  };
};

export class CoreMeetingBookingReportRepository
  implements MeetingBookingReportRepository {
  public constructor(private readonly client: CoreApiClient) {}

  public async listMeetingBookings({
    start,
    end,
  }: {
    start: string;
    end: string;
  }): Promise<ReportMeetingBooking[]> {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!(startTime < endTime)) {
      throw new Error('Invalid meeting booking report window');
    }
    const output: ReportMeetingBooking[] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.client.query({
        meetingBookings: {
          __args: {
            // Later rescheduling or status changes do not change when it was booked.
            filter: {
              and: [{ bookedAt: { gte: start } }, { bookedAt: { lt: end } }],
            },
            first: PAGE_SIZE,
            after: cursor,
          },
          edges: {
            node: {
              id: true,
              bookedAt: true,
              scheduledAt: true,
              wholesalerId: true,
              wholesaler: { id: true, name: true },
            },
          },
          pageInfo: { hasNextPage: true, endCursor: true },
        },
      });
      const connection = record(result.meetingBookings);
      const pageInfo = record(connection.pageInfo);
      if (
        !Array.isArray(connection.edges) ||
        typeof pageInfo.hasNextPage !== 'boolean'
      ) {
        throw new Error('Meeting booking report returned an invalid connection');
      }
      for (const edge of connection.edges) {
        const booking = parseBooking(record(edge).node);
        const bookedTime = Date.parse(booking.bookedAt);
        if (
          bookedTime < startTime ||
          bookedTime >= endTime ||
          seenIds.has(booking.id)
        ) continue;
        seenIds.add(booking.id);
        output.push(booking);
      }
      if (!pageInfo.hasNextPage) return output;
      const nextCursor = optionalString(pageInfo.endCursor);
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error('Meeting booking pagination has a missing or repeated cursor');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error(`Meeting booking pagination exceeded ${MAX_PAGES} pages`);
  }
}
