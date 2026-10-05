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
        or: [
          { and: [{ bookedAt: { gte: $start } }, { bookedAt: { lt: $end } }] }
          { and: [{ status: { eq: COMPLETED } }, { heldAt: { gte: $start } }, { heldAt: { lt: $end } }] }
        ]
      }
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          bookedAt
          heldAt
          status
          bookedById
          takenById
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
  const bookedAt = optionalString(node.bookedAt) ?? null;
  const heldAt = optionalString(node.heldAt);
  const status = optionalString(node.status);
  const scheduledAt = optionalString(node.scheduledAt);
  if (
    !id ||
    (bookedAt !== null && !Number.isFinite(Date.parse(bookedAt))) ||
    (heldAt !== undefined && !Number.isFinite(Date.parse(heldAt))) ||
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
    ...(heldAt ? { heldAt } : {}),
    ...(status ? { status } : {}),
    ...(optionalString(node.bookedById)
      ? { bookedById: optionalString(node.bookedById) }
      : {}),
    ...(optionalString(node.takenById)
      ? { takenById: optionalString(node.takenById) }
      : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    wholesalerId: ownerId || 'unassigned',
    wholesalerName:
      optionalString(wholesaler?.name) ||
      (ownerId ? `Unassigned (${ownerId})` : 'Unassigned'),
  };
};

export class CoreMeetingBookingReportRepository implements MeetingBookingReportRepository {
  public constructor(private readonly rawTransport: RawCoreGraphqlTransport) {}

  private async attachAttribution(
    bookings: ReportMeetingBooking[],
  ): Promise<ReportMeetingBooking[]> {
    const memberIds = [
      ...new Set(
        bookings.flatMap((booking) =>
          [booking.bookedById, booking.takenById].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ),
    ];
    const identities = new Map<string, { id: string; name: string }[]>();
    for (let offset = 0; offset < memberIds.length; offset += 100) {
      const ids = memberIds.slice(offset, offset + 100);
      const result = await this.rawTransport.request<
        {
          wholesalers: {
            edges: {
              node: { id: string; name: string; workspaceMemberId: string };
            }[];
            pageInfo: { hasNextPage: boolean };
          };
        },
        { ids: string[] }
      >({
        operationName: 'CorgiReportMeetingActors',
        document: `query CorgiReportMeetingActors($ids:[UUID!]!){wholesalers(filter:{workspaceMemberId:{in:$ids}},first:200){edges{node{id name workspaceMemberId}}pageInfo{hasNextPage}}}`,
        variables: { ids },
      });
      if (!result.wholesalers?.edges || result.wholesalers.pageInfo.hasNextPage)
        throw new Error('Meeting actor identities are incomplete');
      for (const { node } of result.wholesalers.edges) {
        if (!ids.includes(node.workspaceMemberId))
          throw new Error('Meeting actor identity is outside requested scope');
        identities.set(node.workspaceMemberId, [
          ...(identities.get(node.workspaceMemberId) ?? []),
          node,
        ]);
      }
    }
    return bookings.map((booking) => {
      const setters = identities.get(booking.bookedById ?? '') ?? [];
      const takers = identities.get(booking.takenById ?? '') ?? [];
      return {
        ...booking,
        ...(setters.length === 1
          ? {
              bookedByWholesalerId: setters[0]!.id,
              bookedByName: setters[0]!.name,
            }
          : {}),
        ...(takers.length === 1
          ? { takenByWholesalerId: takers[0]!.id, takenByName: takers[0]!.name }
          : {}),
      };
    });
  }

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
        const bookedTime = booking.bookedAt
          ? Date.parse(booking.bookedAt)
          : NaN;
        const heldTime =
          booking.status === 'COMPLETED' && booking.heldAt
            ? Date.parse(booking.heldAt)
            : NaN;
        if (
          (!(bookedTime >= startTime && bookedTime < endTime) &&
            !(heldTime >= startTime && heldTime < endTime)) ||
          seenIds.has(booking.id)
        )
          continue;
        seenIds.add(booking.id);
        output.push(booking);
      }
      if (!pageInfo.hasNextPage) return this.attachAttribution(output);
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
