import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  MEETING_BOOKING_STATUS,
  type MeetingBookingStatus,
} from 'src/modules/meeting/meeting-identifiers';

export type MeetingBookingRecord = {
  id: string;
  name: string;
  status: MeetingBookingStatus;
  scheduledAt: string | null;
  bookedAt: string | null;
  bookedById: string | null;
  companyId: string | null;
  wholesalerId: string | null;
  bookingValidationMessage: string | null;
  updatedAt: string;
};

type DynamicCoreApiClient = {
  query(selection: Record<string, unknown>): Promise<Record<string, unknown>>;
  mutation(
    selection: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
};

const selection = {
  id: true,
  name: true,
  status: true,
  scheduledAt: true,
  bookedAt: true,
  bookedById: true,
  companyId: true,
  wholesalerId: true,
  bookingValidationMessage: true,
  updatedAt: true,
};

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isMeetingBookingStatus = (
  value: unknown,
): value is MeetingBookingStatus =>
  typeof value === 'string' &&
  Object.values(MEETING_BOOKING_STATUS).includes(
    value as MeetingBookingStatus,
  );

const parseMeetingBooking = (value: unknown): MeetingBookingRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    !isMeetingBookingStatus(candidate.status) ||
    !isNullableString(candidate.scheduledAt) ||
    !isNullableString(candidate.bookedAt) ||
    !isNullableString(candidate.bookedById) ||
    !isNullableString(candidate.companyId) ||
    !isNullableString(candidate.wholesalerId) ||
    !isNullableString(candidate.bookingValidationMessage) ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null;
  }
  return candidate as MeetingBookingRecord;
};

const nodesFrom = (result: Record<string, unknown>): unknown[] => {
  const connection = result.meetingBookings as
    | { edges?: Array<{ node?: unknown }> }
    | undefined;
  return (connection?.edges ?? []).flatMap((edge) =>
    edge.node ? [edge.node] : [],
  );
};

export class CoreMeetingBookingRepository {
  private readonly client: DynamicCoreApiClient;

  public constructor(client: CoreApiClient) {
    this.client = client as unknown as DynamicCoreApiClient;
  }

  public async get(id: string): Promise<MeetingBookingRecord | null> {
    const result = await this.client.query({
      meetingBookings: {
        __args: { filter: { id: { eq: id } }, first: 2 },
        edges: { node: selection },
      },
    });
    const nodes = nodesFrom(result);
    if (nodes.length > 1) throw new Error('Meeting booking ID is not unique');
    if (nodes.length === 0) return null;
    const record = parseMeetingBooking(nodes[0]);
    if (!record || record.id !== id) {
      throw new Error('Meeting booking query returned an invalid record');
    }
    return record;
  }

  public async stampBooked({
    id,
    bookedAt,
    bookedById,
    expectedUpdatedAt,
  }: {
    id: string;
    bookedAt: string;
    bookedById: string | null;
    expectedUpdatedAt: string;
  }): Promise<boolean> {
    try {
      const result = await this.client.mutation({
        updateMeetingBookings: {
          __args: {
            filter: {
              and: [
                { id: { eq: id } },
                { status: { eq: MEETING_BOOKING_STATUS.BOOKED } },
                { bookedAt: { is: 'NULL' } },
                { updatedAt: { eq: expectedUpdatedAt } },
              ],
            },
            data: {
              bookedAt,
              bookedById,
              bookingValidationMessage: null,
            },
          },
          ...selection,
        },
      });
      const rows = result.updateMeetingBookings;
      if (Array.isArray(rows) && rows.length === 1) {
        const updated = parseMeetingBooking(rows[0]);
        if (
          updated?.id === id &&
          updated.status === MEETING_BOOKING_STATUS.BOOKED &&
          updated.bookedAt === bookedAt &&
          updated.bookedById === bookedById &&
          updated.bookingValidationMessage === null
        ) {
          return true;
        }
      }
    } catch {
      // A committed mutation can lose its response. Exact readback is the only
      // safe way to distinguish that case from a competing state transition.
    }
    const persisted = await this.get(id);
    return (
      persisted?.status === MEETING_BOOKING_STATUS.BOOKED &&
      persisted.bookedAt === bookedAt &&
      persisted.bookedById === bookedById &&
      persisted.bookingValidationMessage === null
    );
  }

  public async assignUnassignedOwner({
    id,
    wholesalerId,
  }: {
    id: string;
    wholesalerId: string;
  }): Promise<boolean> {
    try {
      const result = await this.client.mutation({
        updateMeetingBookings: {
          __args: {
            // The still-empty owner is the whole guard. An updatedAt precondition
            // would also fail on an unrelated concurrent edit, leaving the
            // meeting unassigned for the reason this trigger exists to fix.
            filter: {
              and: [{ id: { eq: id } }, { wholesalerId: { is: 'NULL' } }],
            },
            data: { wholesalerId },
          },
          ...selection,
        },
      });
      const rows = result.updateMeetingBookings;
      if (Array.isArray(rows) && rows.length === 1) {
        const updated = parseMeetingBooking(rows[0]);
        if (updated?.id === id && updated.wholesalerId === wholesalerId) {
          return true;
        }
      }
    } catch {
      // See stampBooked: a committed mutation can still lose its response, and
      // readback is the only way to tell that from a competing owner selection.
    }
    const persisted = await this.get(id);
    return persisted?.wholesalerId === wholesalerId;
  }

  public async rejectInvalidBooking({
    id,
    message,
    expectedUpdatedAt,
  }: {
    id: string;
    message: string;
    expectedUpdatedAt: string;
  }): Promise<boolean> {
    try {
      const result = await this.client.mutation({
        updateMeetingBookings: {
          __args: {
            filter: {
              and: [
                { id: { eq: id } },
                { status: { eq: MEETING_BOOKING_STATUS.BOOKED } },
                { bookedAt: { is: 'NULL' } },
                { updatedAt: { eq: expectedUpdatedAt } },
              ],
            },
            data: {
              status: MEETING_BOOKING_STATUS.DRAFT,
              bookingValidationMessage: message,
            },
          },
          ...selection,
        },
      });
      const rows = result.updateMeetingBookings;
      if (Array.isArray(rows) && rows.length === 1) {
        const updated = parseMeetingBooking(rows[0]);
        if (
          updated?.id === id &&
          updated.status === MEETING_BOOKING_STATUS.DRAFT &&
          updated.bookedAt === null &&
          updated.bookingValidationMessage === message
        ) {
          return true;
        }
      }
    } catch {
      // See stampBooked: readback confirms only this exact target state.
    }
    const persisted = await this.get(id);
    return (
      persisted?.status === MEETING_BOOKING_STATUS.DRAFT &&
      persisted.bookedAt === null &&
      persisted.bookingValidationMessage === message
    );
  }
}
