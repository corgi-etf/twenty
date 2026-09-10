import { describe, expect, it, vi } from 'vitest';
import { parse, print } from 'graphql';

import { CoreMeetingBookingReportRepository } from 'src/modules/outreach/graphql/core-meeting-booking-report.repository';

const window = {
  start: '2026-09-08T16:30:00.000Z',
  end: '2026-09-09T16:30:00.000Z',
};
const booking = {
  id: 'booking-1',
  bookedAt: window.start,
  scheduledAt: '2026-10-01T12:00:00.000Z',
  wholesalerId: 'owner-jordan',
  wholesaler: { id: 'owner-jordan', name: 'Jordan' },
};
const connection = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  meetingBookings: {
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage, endCursor },
  },
});

describe('CoreMeetingBookingReportRepository', () => {
  it('paginates all booking owners with booking-time filtering, deduplication and missing relations retained', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        connection(
          Array.from({ length: 100 }, (_, index) => ({
            ...booking,
            id: `booking-${index}`,
          })),
          true,
          'page-1',
        ),
      )
      .mockResolvedValueOnce(
        connection([
          booking,
          {
            ...booking,
            id: 'missing-relation',
            wholesalerId: 'owner-missing',
            wholesaler: null,
          },
          {
            ...booking,
            id: 'unassigned',
            wholesalerId: null,
            wholesaler: null,
            scheduledAt: null,
          },
          { ...booking, id: 'relation-only', wholesalerId: null },
        ]),
      );
    const result = await new CoreMeetingBookingReportRepository({
      request,
    } as never).listMeetingBookings(window);
    expect(result).toHaveLength(103);
    expect(result.find(({ id }) => id === 'missing-relation')).toMatchObject({
      wholesalerId: 'owner-missing',
      wholesalerName: 'Unassigned (owner-missing)',
    });
    expect(result.find(({ id }) => id === 'unassigned')).toEqual({
      id: 'unassigned',
      bookedAt: window.start,
      wholesalerId: 'unassigned',
      wholesalerName: 'Unassigned',
    });
    expect(result.find(({ id }) => id === 'relation-only')).toMatchObject({
      wholesalerId: 'owner-jordan',
      wholesalerName: 'Jordan',
      scheduledAt: booking.scheduledAt,
    });
    expect(request.mock.calls[0]![0]).toMatchObject({
      operationName: 'ReadMeetingBookingsForReport',
      variables: { ...window, first: 100, after: null },
    });
    expect(print(parse(request.mock.calls[0]![0].document))).toBe(
      print(
        parse(`
      query ReadMeetingBookingsForReport($start: DateTime!, $end: DateTime!, $first: Int!, $after: String) {
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
          edges { node { id bookedAt createdAt scheduledAt wholesalerId wholesaler { id name } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `),
      ),
    );
    expect(request.mock.calls[1]![0].variables.after).toBe('page-1');
  });

  it('includes booking start but excludes older bookings scheduled now and end/future bookings', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        connection([
          booking,
          {
            ...booking,
            id: 'older',
            bookedAt: '2026-09-08T16:29:59.999Z',
            scheduledAt: window.start,
          },
          { ...booking, id: 'end', bookedAt: window.end },
          { ...booking, id: 'future', bookedAt: '2026-09-09T16:30:00.001Z' },
        ]),
      );
    expect(
      (
        await new CoreMeetingBookingReportRepository({
          request,
        } as never).listMeetingBookings(window)
      ).map(({ id }) => id),
    ).toEqual(['booking-1']);
  });

  it.each([
    {},
    { meetingBookings: null },
    { meetingBookings: { edges: null, pageInfo: { hasNextPage: false } } },
    { meetingBookings: { edges: [], pageInfo: null } },
    { meetingBookings: { edges: [], pageInfo: { hasNextPage: 'false' } } },
    connection([null]),
    connection([{ ...booking, id: '' }]),
    connection([{ ...booking, bookedAt: null }]),
    connection([{ ...booking, bookedAt: 'invalid' }]),
    connection([
      {
        ...booking,
        wholesaler: { id: 'different-owner', name: 'Wrong owner' },
      },
    ]),
  ])(
    'rejects malformed data instead of silently returning zero or attributing a wrong owner: %j',
    async (response) => {
      const request = vi.fn().mockResolvedValue(response);
      await expect(
        new CoreMeetingBookingReportRepository({
          request,
        } as never).listMeetingBookings(window),
      ).rejects.toThrow(/meeting booking/i);
    },
  );

  it('propagates CRM read failures', async () => {
    const request = vi.fn().mockRejectedValue(new Error('CRM unavailable'));
    await expect(
      new CoreMeetingBookingReportRepository({
        request,
      } as never).listMeetingBookings(window),
    ).rejects.toThrow('CRM unavailable');
  });

  it('fails rather than returning a partial report on a missing or cycling cursor', async () => {
    for (const endCursor of [null, 'a']) {
      const request = vi
        .fn()
        .mockResolvedValueOnce(connection([booking], true, 'a'))
        .mockResolvedValueOnce(connection([], true, 'b'))
        .mockResolvedValueOnce(connection([], true, endCursor));
      await expect(
        new CoreMeetingBookingReportRepository({
          request,
        } as never).listMeetingBookings(window),
      ).rejects.toThrow(/pagination.*cursor/i);
      expect(request).toHaveBeenCalledTimes(3);
    }
  });

  it('bounds pagination and rejects invalid input windows before querying CRM', async () => {
    const request = vi
      .fn()
      .mockImplementation(async () =>
        connection([], true, `page-${request.mock.calls.length}`),
      );
    const repository = new CoreMeetingBookingReportRepository({
      request,
    } as never);
    await expect(repository.listMeetingBookings(window)).rejects.toThrow(
      /pagination.*100 pages/i,
    );
    expect(request).toHaveBeenCalledTimes(100);
    request.mockClear();
    await expect(
      repository.listMeetingBookings({ ...window, start: window.end }),
    ).rejects.toThrow(/window/i);
    await expect(
      repository.listMeetingBookings({ ...window, end: 'invalid' }),
    ).rejects.toThrow(/window/i);
    expect(request).not.toHaveBeenCalled();
  });
});
