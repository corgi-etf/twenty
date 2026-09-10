import { describe, expect, it, vi } from 'vitest';

import {
  reconcileMeetingBooking,
  type MeetingBookingRepository,
} from 'src/modules/meeting/services/reconcile-meeting-booking.service';

const meeting = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Portfolio review',
  status: 'BOOKED' as const,
  scheduledAt: '2026-09-18T15:00:00.000Z',
  bookedAt: null,
  bookedById: null,
  companyId: '22222222-2222-4222-8222-222222222222',
  wholesalerId: '33333333-3333-4333-8333-333333333333',
  bookingValidationMessage: null,
};

const repository = (record = meeting): MeetingBookingRepository => ({
  get: vi.fn().mockResolvedValue(record),
  stampBooked: vi.fn().mockResolvedValue(true),
  rejectInvalidBooking: vi.fn().mockResolvedValue(true),
});

describe('reconcileMeetingBooking', () => {
  it('stamps the immutable booking instant and valid updating member', async () => {
    const repo = repository();

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: '44444444-4444-4444-8444-444444444444',
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.stampBooked).toHaveBeenCalledWith({
      id: meeting.id,
      bookedAt: '2026-09-10T13:15:00.000Z',
      bookedById: '44444444-4444-4444-8444-444444444444',
    });
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });

  it.each([
    ['name', { name: ' ' }, 'meeting title'],
    ['company', { companyId: null }, 'RIA / company'],
    ['owner', { wholesalerId: null }, 'owner'],
    ['time', { scheduledAt: null }, 'scheduled date and time'],
  ])('keeps an invalid %s booking in DRAFT with visible feedback', async (_label, patch, expected) => {
    const repo = repository({ ...meeting, ...patch });

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
      }),
    ).resolves.toMatchObject({ status: 'invalid', meetingId: meeting.id });
    expect(repo.rejectInvalidBooking).toHaveBeenCalledWith({
      id: meeting.id,
      message: expect.stringContaining(expected),
    });
    expect(repo.stampBooked).not.toHaveBeenCalled();
  });

  it.each([
    { ...meeting, status: 'DRAFT' as const },
    { ...meeting, status: 'CANCELLED' as const },
    { ...meeting, bookedAt: '2026-08-01T12:00:00.000Z' },
  ])('does not stamp a draft, stale transition, reschedule, or reopening', async (record) => {
    const repo = repository(record);

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'ignored', meetingId: meeting.id });
    expect(repo.stampBooked).not.toHaveBeenCalled();
  });

  it('fails for retry when compare-and-set loses an unconfirmed race', async () => {
    const repo = repository();
    vi.mocked(repo.stampBooked).mockResolvedValue(false);

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
      }),
    ).rejects.toThrow(/changed while booking/i);
  });

  it('does not persist a malformed booking actor', async () => {
    const repo = repository();
    await reconcileMeetingBooking({
      meetingId: meeting.id,
      eventOccurredAt: '2026-09-10T13:15:00.000Z',
      actorWorkspaceMemberId: 'not-a-uuid',
      repository: repo,
    });
    expect(repo.stampBooked).toHaveBeenCalledWith(
      expect.objectContaining({ bookedById: null }),
    );
  });
});
