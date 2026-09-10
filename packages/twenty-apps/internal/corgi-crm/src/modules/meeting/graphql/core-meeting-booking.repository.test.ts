import { describe, expect, it, vi } from 'vitest';

import {
  CoreMeetingBookingRepository,
  type MeetingBookingRecord,
} from 'src/modules/meeting/graphql/core-meeting-booking.repository';

const meeting: MeetingBookingRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Portfolio review',
  status: 'BOOKED',
  scheduledAt: '2026-09-18T15:00:00.000Z',
  bookedAt: null,
  bookedById: null,
  companyId: '22222222-2222-4222-8222-222222222222',
  wholesalerId: '33333333-3333-4333-8333-333333333333',
  bookingValidationMessage: null,
  updatedAt: '2026-09-10T13:14:59.000Z',
};

describe('CoreMeetingBookingRepository', () => {
  it('loads exactly one authoritative booking by ID', async () => {
    const query = vi.fn().mockResolvedValue({
      meetingBookings: { edges: [{ node: meeting }] },
    });
    const repository = new CoreMeetingBookingRepository({ query } as never);

    await expect(repository.get(meeting.id)).resolves.toEqual(meeting);
    expect(query.mock.calls[0]?.[0].meetingBookings.__args).toEqual({
      filter: { id: { eq: meeting.id } },
      first: 2,
    });
  });

  it('atomically stamps the first BOOKED transition', async () => {
    const bookedAt = '2026-09-10T13:15:00.000Z';
    const mutation = vi.fn().mockResolvedValue({
      updateMeetingBookings: [
        { ...meeting, bookedAt, bookedById: '44444444-4444-4444-8444-444444444444' },
      ],
    });
    const repository = new CoreMeetingBookingRepository({
      mutation,
      query: vi.fn(),
    } as never);

    await expect(
      repository.stampBooked({
        id: meeting.id,
        bookedAt,
        bookedById: '44444444-4444-4444-8444-444444444444',
        expectedUpdatedAt: meeting.updatedAt,
      }),
    ).resolves.toBe(true);
    expect(mutation.mock.calls[0]?.[0].updateMeetingBookings.__args).toEqual({
      filter: {
        and: [
          { id: { eq: meeting.id } },
          { status: { eq: 'BOOKED' } },
          { bookedAt: { is: 'NULL' } },
          { updatedAt: { eq: meeting.updatedAt } },
        ],
      },
      data: {
        bookedAt,
        bookedById: '44444444-4444-4444-8444-444444444444',
        bookingValidationMessage: null,
      },
    });
  });

  it('confirms a lost mutation response only from the exact persisted stamp', async () => {
    const bookedAt = '2026-09-10T13:15:00.000Z';
    const query = vi.fn().mockResolvedValue({
      meetingBookings: {
        edges: [{ node: { ...meeting, bookedAt, bookedById: null } }],
      },
    });
    const repository = new CoreMeetingBookingRepository({
      mutation: vi.fn().mockRejectedValue(new Error('response lost')),
      query,
    } as never);

    await expect(
      repository.stampBooked({
        id: meeting.id,
        bookedAt,
        bookedById: null,
        expectedUpdatedAt: meeting.updatedAt,
      }),
    ).resolves.toBe(true);
  });

  it('fails a booking stamp closed after a competing transition', async () => {
    const repository = new CoreMeetingBookingRepository({
      mutation: vi.fn().mockResolvedValue({ updateMeetingBookings: [] }),
      query: vi.fn().mockResolvedValue({
        meetingBookings: {
          edges: [
            {
              node: {
                ...meeting,
                status: 'CANCELLED',
                bookedAt: '2026-09-10T13:14:00.000Z',
              },
            },
          ],
        },
      }),
    } as never);

    await expect(
      repository.stampBooked({
        id: meeting.id,
        bookedAt: '2026-09-10T13:15:00.000Z',
        bookedById: null,
        expectedUpdatedAt: meeting.updatedAt,
      }),
    ).resolves.toBe(false);
  });

  it('does not stamp after a validated field changes concurrently', async () => {
    const repository = new CoreMeetingBookingRepository({
      mutation: vi.fn().mockResolvedValue({ updateMeetingBookings: [] }),
      query: vi.fn().mockResolvedValue({
        meetingBookings: {
          edges: [
            {
              node: {
                ...meeting,
                companyId: null,
                updatedAt: '2026-09-10T13:15:01.000Z',
              },
            },
          ],
        },
      }),
    } as never);

    await expect(
      repository.stampBooked({
        id: meeting.id,
        bookedAt: '2026-09-10T13:15:00.000Z',
        bookedById: null,
        expectedUpdatedAt: meeting.updatedAt,
      }),
    ).resolves.toBe(false);
  });

  it('atomically returns an invalid BOOKED attempt to DRAFT with feedback', async () => {
    const mutation = vi.fn().mockResolvedValue({
      updateMeetingBookings: [
        {
          ...meeting,
          status: 'DRAFT',
          bookingValidationMessage: 'Set an RIA / company before booking.',
        },
      ],
    });
    const repository = new CoreMeetingBookingRepository({
      mutation,
      query: vi.fn(),
    } as never);

    await expect(
      repository.rejectInvalidBooking({
        id: meeting.id,
        message: 'Set an RIA / company before booking.',
        expectedUpdatedAt: meeting.updatedAt,
      }),
    ).resolves.toBe(true);
    expect(mutation.mock.calls[0]?.[0].updateMeetingBookings.__args.filter)
      .toEqual({
        and: [
          { id: { eq: meeting.id } },
          { status: { eq: 'BOOKED' } },
          { bookedAt: { is: 'NULL' } },
          { updatedAt: { eq: meeting.updatedAt } },
        ],
      });
  });
});
