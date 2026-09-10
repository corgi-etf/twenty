import { describe, expect, it, vi } from 'vitest';

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
const connection = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  meetingBookings: {
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage, endCursor },
  },
});

describe('CoreMeetingBookingReportRepository', () => {
  it('paginates all booking owners with booking-time filtering, deduplication and missing relations retained', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(connection(
        Array.from({ length: 100 }, (_, index) => ({ ...booking, id: `booking-${index}` })),
        true,
        'page-1',
      ))
      .mockResolvedValueOnce(connection([
        booking,
        { ...booking, id: 'missing-relation', wholesalerId: 'owner-missing', wholesaler: null },
        { ...booking, id: 'unassigned', wholesalerId: null, wholesaler: null, scheduledAt: null },
        { ...booking, id: 'relation-only', wholesalerId: null },
      ]));
    const result = await new CoreMeetingBookingReportRepository({ query } as never).listMeetingBookings(window);
    expect(result).toHaveLength(103);
    expect(result.find(({ id }) => id === 'missing-relation')).toMatchObject({
      wholesalerId: 'owner-missing', wholesalerName: 'Unassigned (owner-missing)',
    });
    expect(result.find(({ id }) => id === 'unassigned')).toEqual({
      id: 'unassigned', bookedAt: window.start, wholesalerId: 'unassigned', wholesalerName: 'Unassigned',
    });
    expect(result.find(({ id }) => id === 'relation-only')).toMatchObject({
      wholesalerId: 'owner-jordan', wholesalerName: 'Jordan', scheduledAt: booking.scheduledAt,
    });
    expect(query.mock.calls[0]![0].meetingBookings.__args.filter).toEqual({ and: [
      { bookedAt: { gte: window.start } }, { bookedAt: { lt: window.end } },
    ] });
    expect(query.mock.calls[0]![0].meetingBookings.edges.node).toEqual({
      id: true, bookedAt: true, scheduledAt: true, wholesalerId: true, wholesaler: { id: true, name: true },
    });
    expect(query.mock.calls[1]![0].meetingBookings.__args.after).toBe('page-1');
  });

  it('includes booking start but excludes older bookings scheduled now and end/future bookings', async () => {
    const query = vi.fn().mockResolvedValue(connection([
      booking,
      { ...booking, id: 'older', bookedAt: '2026-09-08T16:29:59.999Z', scheduledAt: window.start },
      { ...booking, id: 'end', bookedAt: window.end },
      { ...booking, id: 'future', bookedAt: '2026-09-09T16:30:00.001Z' },
    ]));
    expect((await new CoreMeetingBookingReportRepository({ query } as never).listMeetingBookings(window)).map(({ id }) => id)).toEqual(['booking-1']);
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
    connection([{ ...booking, wholesaler: { id: 'different-owner', name: 'Wrong owner' } }]),
  ])('rejects malformed data instead of silently returning zero or attributing a wrong owner: %j', async (response) => {
    const query = vi.fn().mockResolvedValue(response);
    await expect(new CoreMeetingBookingReportRepository({ query } as never).listMeetingBookings(window)).rejects.toThrow(/meeting booking/i);
  });

  it('propagates CRM read failures', async () => {
    const query = vi.fn().mockRejectedValue(new Error('CRM unavailable'));
    await expect(new CoreMeetingBookingReportRepository({ query } as never).listMeetingBookings(window)).rejects.toThrow('CRM unavailable');
  });

  it('fails rather than returning a partial report on a missing or cycling cursor', async () => {
    for (const endCursor of [null, 'a']) {
      const query = vi.fn()
        .mockResolvedValueOnce(connection([booking], true, 'a'))
        .mockResolvedValueOnce(connection([], true, 'b'))
        .mockResolvedValueOnce(connection([], true, endCursor));
      await expect(new CoreMeetingBookingReportRepository({ query } as never).listMeetingBookings(window)).rejects.toThrow(/pagination.*cursor/i);
      expect(query).toHaveBeenCalledTimes(3);
    }
  });

  it('bounds pagination and rejects invalid input windows before querying CRM', async () => {
    const query = vi.fn().mockImplementation(async () => connection([], true, `page-${query.mock.calls.length}`));
    const repository = new CoreMeetingBookingReportRepository({ query } as never);
    await expect(repository.listMeetingBookings(window)).rejects.toThrow(/pagination.*100 pages/i);
    expect(query).toHaveBeenCalledTimes(100);
    query.mockClear();
    await expect(repository.listMeetingBookings({ ...window, start: window.end })).rejects.toThrow(/window/i);
    await expect(repository.listMeetingBookings({ ...window, end: 'invalid' })).rejects.toThrow(/window/i);
    expect(query).not.toHaveBeenCalled();
  });
});
