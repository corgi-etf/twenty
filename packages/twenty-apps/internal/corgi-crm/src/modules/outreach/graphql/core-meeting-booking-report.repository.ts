import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type MeetingBookingReportRepository,
  type ReportMeetingBooking,
} from 'src/modules/outreach/report-meeting-booking.types';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

type MeetingBookingsReportData = { meetingBookings: unknown };
type MeetingBookingsReportVariables = {
  start: string;
  end: string;
  first: number;
  after: string | null;
};

// Raw GraphQL retains the permitted external Wholesaler relation that the
// application-owned generated client schema cannot describe.
const READ_MEETING_BOOKINGS_FOR_REPORT = `
  query ReadMeetingBookingsForReport(
    $start: DateTime!
    $end: DateTime!
    $first: Int!
    $after: String
  ) {
    meetingBookings(
      filter: {
        and: [
          { or: [{ bookedAt: { gte: $start } }, { createdAt: { gte: $start } }] }
          { or: [{ bookedAt: { lt: $end } }, { createdAt: { lt: $end } }] }
        ]
      }
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          bookedAt
          createdAt
          scheduledAt
          wholesalerId
          wholesaler { id name }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

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
  // bookedAt is app-maintained and nullable, so a booking whose trigger never
  // ran has no value and fails both window predicates -- present, real, and
  // uncountable. createdAt always exists, so use it as the effective instant.
  const rawBookedAt = optionalString(node.bookedAt);
  const createdAt = optionalString(node.createdAt);
  const bookedAt =
    rawBookedAt && Number.isFinite(Date.parse(rawBookedAt))
      ? rawBookedAt
      : createdAt;
  const scheduledAt = optionalString(node.scheduledAt);
  if (
    !id ||
    !bookedAt ||
    !Number.isFinite(Date.parse(bookedAt)) ||
    (scheduledAt && !Number.isFinite(Date.parse(scheduledAt)))
  ) {
    throw new Error(
      'Meeting booking report returned an invalid identity or timestamp',
    );
  }
  const wholesaler =
    node.wholesaler === null || node.wholesaler === undefined
      ? undefined
      : record(node.wholesaler);
  const foreignOwnerId = optionalString(node.wholesalerId);
  const relatedOwnerId = optionalString(wholesaler?.id);
  if (foreignOwnerId && relatedOwnerId && foreignOwnerId !== relatedOwnerId) {
    throw new Error(
      'Meeting booking report returned conflicting owner identities',
    );
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

export class CoreMeetingBookingReportRepository implements MeetingBookingReportRepository {
  public constructor(private readonly rawTransport: RawCoreGraphqlTransport) {}

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
      const result = await this.rawTransport.request<
        MeetingBookingsReportData,
        MeetingBookingsReportVariables
      >({
        operationName: 'ReadMeetingBookingsForReport',
        document: READ_MEETING_BOOKINGS_FOR_REPORT,
        // Later rescheduling or status changes do not change when it was booked.
        variables: { start, end, first: PAGE_SIZE, after: cursor ?? null },
      });
      const connection = record(result.meetingBookings);
      const pageInfo = record(connection.pageInfo);
      if (
        !Array.isArray(connection.edges) ||
        typeof pageInfo.hasNextPage !== 'boolean'
      ) {
        throw new Error(
          'Meeting booking report returned an invalid connection',
        );
      }
      for (const edge of connection.edges) {
        const booking = parseBooking(record(edge).node);
        const bookedTime = Date.parse(booking.bookedAt);
        if (
          bookedTime < startTime ||
          bookedTime >= endTime ||
          seenIds.has(booking.id)
        )
          continue;
        seenIds.add(booking.id);
        output.push(booking);
      }
      if (!pageInfo.hasNextPage) return output;
      const nextCursor = optionalString(pageInfo.endCursor);
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error(
          'Meeting booking pagination has a missing or repeated cursor',
        );
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error(`Meeting booking pagination exceeded ${MAX_PAGES} pages`);
  }
}
