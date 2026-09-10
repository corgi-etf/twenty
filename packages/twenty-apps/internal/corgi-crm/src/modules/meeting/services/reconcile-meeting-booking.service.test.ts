import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_WHOLESALER_ROLE } from 'src/constants';
import { type MeetingBookingRecord } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import {
  reconcileMeetingBooking,
  type MeetingBookingRepository,
  type MeetingOwnerRepository,
} from 'src/modules/meeting/services/reconcile-meeting-booking.service';

const meeting: MeetingBookingRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Portfolio review',
  status: 'BOOKED',
  scheduledAt: '2026-09-18T15:00:00.000Z',
  bookedAt: null,
  bookedById: null,
  companyId: '22222222-2222-4222-8222-222222222222',
  wholesalerId: '33333333-3333-4333-8333-333333333333',
  externalWholesalerId: null,
  allocationRequested: null,
  bookingValidationMessage: null,
  updatedAt: '2026-09-10T13:14:59.000Z',
};

const EXTERNAL_WHOLESALER_ID = '55555555-5555-4555-8555-555555555555';

const attributedMeeting = {
  ...meeting,
  externalWholesalerId: EXTERNAL_WHOLESALER_ID,
  allocationRequested: { amountMicros: 2_500_000, currencyCode: 'USD' },
};

const repository = (
  record: MeetingBookingRecord = meeting,
): MeetingBookingRepository => ({
  get: vi.fn().mockResolvedValue(record),
  stampBooked: vi.fn().mockResolvedValue(true),
  rejectInvalidBooking: vi.fn().mockResolvedValue(true),
});

const ownerRepository = (
  wholesalerRole: string | null = DEFAULT_WHOLESALER_ROLE,
): MeetingOwnerRepository => ({
  findById: vi.fn().mockResolvedValue({
    id: meeting.wholesalerId,
    name: 'Nash',
    wholesalerRole,
  }),
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
        ownerRepository: ownerRepository(),
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.stampBooked).toHaveBeenCalledWith({
      id: meeting.id,
      bookedAt: '2026-09-10T13:15:00.000Z',
      bookedById: '44444444-4444-4444-8444-444444444444',
      expectedUpdatedAt: meeting.updatedAt,
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
    const owners = ownerRepository();

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: owners,
      }),
    ).resolves.toMatchObject({ status: 'invalid', meetingId: meeting.id });
    expect(repo.rejectInvalidBooking).toHaveBeenCalledWith({
      id: meeting.id,
      message: expect.stringContaining(expected),
      expectedUpdatedAt: meeting.updatedAt,
    });
    expect(repo.stampBooked).not.toHaveBeenCalled();
    expect(owners.findById).not.toHaveBeenCalled();
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
        ownerRepository: ownerRepository(),
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
        ownerRepository: ownerRepository(),
      }),
    ).rejects.toThrow(/changed while booking/i);
  });

  it('re-reads the authoritative row and uses its new fence on a retry', async () => {
    const changedMeeting = {
      ...meeting,
      updatedAt: '2026-09-10T13:15:01.000Z',
    };
    const repo = repository();
    vi.mocked(repo.get)
      .mockResolvedValueOnce(meeting)
      .mockResolvedValueOnce(changedMeeting);
    vi.mocked(repo.stampBooked)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const input = {
      meetingId: meeting.id,
      eventOccurredAt: '2026-09-10T13:15:00.000Z',
      actorWorkspaceMemberId: null,
      repository: repo,
      ownerRepository: ownerRepository(),
    };

    await expect(reconcileMeetingBooking(input)).rejects.toThrow(
      /changed while booking/i,
    );
    await expect(reconcileMeetingBooking(input)).resolves.toEqual({
      status: 'booked',
      meetingId: meeting.id,
    });
    expect(repo.get).toHaveBeenCalledTimes(2);
    expect(repo.stampBooked).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedUpdatedAt: changedMeeting.updatedAt }),
    );
  });

  it('does not persist a malformed booking actor', async () => {
    const repo = repository();
    await reconcileMeetingBooking({
      meetingId: meeting.id,
      eventOccurredAt: '2026-09-10T13:15:00.000Z',
      actorWorkspaceMemberId: 'not-a-uuid',
      repository: repo,
      ownerRepository: ownerRepository(),
    });
    expect(repo.stampBooked).toHaveBeenCalledWith(
      expect.objectContaining({ bookedById: null }),
    );
  });

  it.each([['BDR'], ['bdr'], ['  Bdr  '], ['\tBDR\n']])(
    'keeps a BDR-owned booking without an EW in DRAFT when its role reads %j',
    async (role) => {
      const repo = repository();
      const owners = ownerRepository(role);

      await expect(
        reconcileMeetingBooking({
          meetingId: meeting.id,
          eventOccurredAt: '2026-09-10T13:15:00.000Z',
          actorWorkspaceMemberId: null,
          repository: repo,
          ownerRepository: owners,
        }),
      ).resolves.toEqual({
        status: 'invalid',
        meetingId: meeting.id,
        message: 'Set EW before booking.',
      });
      expect(owners.findById).toHaveBeenCalledWith(meeting.wholesalerId);
      expect(repo.rejectInvalidBooking).toHaveBeenCalledWith({
        id: meeting.id,
        message: 'Set EW before booking.',
        expectedUpdatedAt: meeting.updatedAt,
      });
      expect(repo.stampBooked).not.toHaveBeenCalled();
    },
  );

  it('books a BDR meeting that names an EW without reading the owner', async () => {
    const repo = repository(attributedMeeting);
    const owners = ownerRepository('BDR');

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: owners,
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(owners.findById).not.toHaveBeenCalled();
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });

  it('rejects a BDR booking whose EW link is not a usable record', async () => {
    const repo = repository({
      ...meeting,
      externalWholesalerId: 'not-a-uuid',
    });

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: ownerRepository('BDR'),
      }),
    ).resolves.toMatchObject({ status: 'invalid', message: 'Set EW before booking.' });
  });

  it.each([
    ['an unset role', null],
    ['an empty role', ''],
    ['a whitespace role', '   '],
    ['the legacy default role', DEFAULT_WHOLESALER_ROLE],
    ['a lowercase legacy role', 'wholesaler'],
    ['an external wholesaler role', 'EW'],
    ['an unrecognised role', 'Sales'],
    ['a role that merely contains BDR', 'BDR Manager'],
  ])('books an EW-less meeting owned by %s', async (_label, role) => {
    const repo = repository();

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: ownerRepository(role),
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });

  it.each([
    ['no allocation at all', null],
    ['an empty allocation', { amountMicros: null, currencyCode: null }],
    ['a currency with no amount', { amountMicros: null, currencyCode: 'USD' }],
  ])('keeps a meeting attributed to an EW in DRAFT with %s', async (_label, allocationRequested) => {
    const repo = repository({
      ...attributedMeeting,
      allocationRequested,
    });
    const owners = ownerRepository();

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: owners,
      }),
    ).resolves.toEqual({
      status: 'invalid',
      meetingId: meeting.id,
      message: 'Set allocation requested before booking.',
    });
    expect(repo.stampBooked).not.toHaveBeenCalled();
    // The amount is on the record itself, so no owner role read is needed.
    expect(owners.findById).not.toHaveBeenCalled();
  });

  it.each([
    ['a positive amount', { amountMicros: 2_500_000, currencyCode: 'USD' }],
    ['an explicit zero', { amountMicros: 0, currencyCode: 'USD' }],
    ['an amount with no currency code', { amountMicros: 750_000, currencyCode: null }],
  ])('books a meeting attributed to an EW that lists %s', async (_label, allocationRequested) => {
    const repo = repository({ ...attributedMeeting, allocationRequested });

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: ownerRepository(),
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the legacy default role',
      DEFAULT_WHOLESALER_ROLE,
      { status: 'booked', meetingId: meeting.id },
    ],
    [
      'a BDR role',
      'BDR',
      {
        status: 'invalid',
        meetingId: meeting.id,
        message: 'Set EW before booking.',
      },
    ],
  ])('never asks for an allocation on a meeting with no EW, owned by %s', async (_label, role, expected) => {
    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repository({ ...meeting, allocationRequested: null }),
        ownerRepository: ownerRepository(role),
      }),
    ).resolves.toEqual(expected);
  });

  it('names every missing field, including the allocation, in one message', async () => {
    const repo = repository({
      ...attributedMeeting,
      name: ' ',
      allocationRequested: null,
    });

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: ownerRepository(),
      }),
    ).resolves.toEqual({
      status: 'invalid',
      meetingId: meeting.id,
      message: 'Set meeting title, allocation requested before booking.',
    });
  });

  it('books an EW-less meeting when the owner record cannot be found', async () => {
    const repo = repository();
    const owners: MeetingOwnerRepository = {
      findById: vi.fn().mockResolvedValue(null),
    };

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: owners,
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });

  it('books an EW-less meeting when the owner role cannot be read at all', async () => {
    const repo = repository();
    const owners: MeetingOwnerRepository = {
      findById: vi.fn().mockRejectedValue(new Error('permission denied')),
    };

    await expect(
      reconcileMeetingBooking({
        meetingId: meeting.id,
        eventOccurredAt: '2026-09-10T13:15:00.000Z',
        actorWorkspaceMemberId: null,
        repository: repo,
        ownerRepository: owners,
      }),
    ).resolves.toEqual({ status: 'booked', meetingId: meeting.id });
    expect(repo.stampBooked).toHaveBeenCalled();
    expect(repo.rejectInvalidBooking).not.toHaveBeenCalled();
  });
});
