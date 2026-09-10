import { describe, expect, it, vi } from 'vitest';

import {
  formatMeetingBookedNotification,
  readMeetingBookedNotificationSnapshot,
} from 'src/modules/telegram/services/meeting-booked-notification.service';

const booking = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'BOOKED',
  bookedAt: '2026-09-10T05:30:00.000Z',
  scheduledAt: '2026-09-15T19:00:00.000Z',
  company: { id: '22222222-2222-4222-8222-222222222222', name: ' Acme\nRIA ' },
  wholesaler: { id: '33333333-3333-4333-8333-333333333333', name: ' Nash ' },
  bookedBy: {
    id: '44444444-4444-4444-8444-444444444444',
    name: { firstName: 'Grace', lastName: 'Kelly' },
  },
};

describe('meeting booked notification snapshots', () => {
  it('formats the required alert without ARR or raw identifiers', () => {
    const text = formatMeetingBookedNotification(
      {
        type: 'meeting_booked',
        meetingId: booking.id,
        bookedAt: booking.bookedAt,
        scheduledAt: booking.scheduledAt,
        riaName: 'Acme RIA',
        ownerName: 'Nash',
        bookedByName: 'Grace Kelly',
      },
      'America/Chicago',
    );

    expect(text).toContain('🎉 NEW MEETING BOOKED! 🎉');
    expect(text).toContain('RIA: Acme RIA');
    expect(text).toContain('Date: Sep 15, 2026, 2:00 PM CDT');
    expect(text).toContain('Owner: Nash');
    expect(text).toContain('Booked: Sep 10, 2026, 12:30 AM CDT');
    expect(text).toContain('Booked by: Grace Kelly');
    expect(text).not.toMatch(/ARR|11111111|44444444/);
  });

  it('persists the first authoritative event and reuses it before any CRM requery', async () => {
    const values = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(),
    };
    const readMeetingBooking = vi.fn().mockResolvedValue(booking);
    const input = {
      meetingId: booking.id,
      bookedAt: booking.bookedAt,
      store,
      readMeetingBooking,
    };

    const first = await readMeetingBookedNotificationSnapshot(input);
    readMeetingBooking.mockRejectedValue(new Error('CRM unavailable'));
    const retry = await readMeetingBookedNotificationSnapshot(input);

    expect(first).toEqual(retry);
    expect(first).toMatchObject({ riaName: 'Acme RIA', ownerName: 'Nash' });
    expect(readMeetingBooking).toHaveBeenCalledOnce();
  });

  it.each([
    { ...booking, status: 'DRAFT' },
    { ...booking, bookedAt: '2026-09-10T05:31:00.000Z' },
    { ...booking, company: null },
    { ...booking, wholesaler: { ...booking.wholesaler, name: ' ' } },
    { ...booking, scheduledAt: 'not-a-date' },
  ])('rejects an invalid authoritative booking %#', async (invalidBooking) => {
    await expect(
      readMeetingBookedNotificationSnapshot({
        meetingId: booking.id,
        bookedAt: booking.bookedAt,
        store: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() },
        readMeetingBooking: vi.fn().mockResolvedValue(invalidBooking),
      }),
    ).rejects.toThrow(/authoritative meeting booking/i);
  });
});
