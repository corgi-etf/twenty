import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_WHOLESALER_ROLE } from 'src/constants';
import {
  buildExternalWholesalerRevenueSection,
  buildReportSummary,
  formatReportSummary,
  getReportWindow,
  PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE,
  readReportSummary,
} from 'src/modules/outreach/services/report-summary.service';
import { type OutreachActivity } from 'src/modules/outreach/types';
import { type WholesalerRecord } from 'src/modules/wholesaler/onboarding/types';

const activity = (
  id: string,
  overrides: Partial<OutreachActivity> = {},
): OutreachActivity => ({
  id,
  wholesalerId: 'owner-jordan',
  wholesalerName: 'Jordan',
  companyName: 'Private company',
  contactName: 'Private contact',
  notes: 'Private notes',
  activityType: 'phone_call',
  outcome: 'connected',
  occurredAt: '2026-09-09T15:00:00.000Z',
  ...overrides,
});

const wholesaler = (
  id: string,
  wholesalerRole: string | null,
  name = id,
): WholesalerRecord => ({
  id,
  name,
  email: `${id}@example.test`,
  wholesalerRole,
  workspaceMemberId: `member-${id}`,
});

const section = (wholesalerRoles: WholesalerRecord[]) =>
  buildExternalWholesalerRevenueSection(wholesalerRoles);

const defaults = {
  period: 'daily' as const,
  now: new Date('2026-09-09T16:30:00.000Z'),
  timeZone: 'America/Chicago',
  meetingBookings: [],
};

describe('outreach report summaries', () => {
  it('reads all-owner bookings and activities with the same window and never masks a failed booking read', async () => {
    const repository = { listActivities: vi.fn().mockResolvedValue([]) };
    const meetingRepository = {
      listMeetingBookings: vi.fn().mockResolvedValue([{
        id: 'booking-1',
        bookedAt: '2026-09-09T15:00:00.000Z',
        wholesalerId: 'owner-booker',
        wholesalerName: 'Casey',
      }]),
    };
    const input = { ...defaults, repository, meetingRepository };
    const text = await readReportSummary(input);
    const window = {
      start: '2026-09-08T16:30:00.000Z',
      end: '2026-09-09T16:30:00.000Z',
    };
    expect(repository.listActivities).toHaveBeenCalledWith(window);
    expect(meetingRepository.listMeetingBookings).toHaveBeenCalledWith(window);
    expect(text).toContain('Meetings set: 1');
    expect(text).toContain('Total activities: 0');
    meetingRepository.listMeetingBookings.mockRejectedValue(new Error('Meeting read unavailable'));
    await expect(readReportSummary(input)).rejects.toThrow('Meeting read unavailable');
    meetingRepository.listMeetingBookings.mockResolvedValue(undefined);
    await expect(readReportSummary(input)).rejects.toThrow();
  });

  it('counts meetings by booking time independently of activity totals and scheduled dates', () => {
    const meetingBookings = [
      {
        id: 'booking-1',
        bookedAt: '2026-09-09T15:00:00.000Z',
        scheduledAt: '2026-10-01T15:00:00.000Z',
        wholesalerId: 'owner-jordan',
        wholesalerName: 'Jordan',
      },
      {
        id: 'booking-2',
        bookedAt: '2026-09-09T15:00:00.000Z',
        wholesalerId: 'owner-booker',
        wholesalerName: 'Casey',
      },
      {
        id: 'old-booking',
        bookedAt: '2026-08-01T15:00:00.000Z',
        scheduledAt: '2026-09-09T15:00:00.000Z',
        wholesalerId: 'owner-jordan',
        wholesalerName: 'Jordan',
      },
    ];
    const summary = buildReportSummary({
      ...defaults,
      activities: [activity('booking-1')],
      meetingBookings: [...meetingBookings, meetingBookings[0]!],
    });

    expect(summary.total).toBe(1);
    expect(summary.totalMeetingsSet).toBe(2);
    expect(summary.leaderboard).toEqual([
      { ownerId: 'owner-jordan', name: 'Jordan', count: 1, meetingsSet: 1 },
      { ownerId: 'owner-booker', name: 'Casey', count: 0, meetingsSet: 1 },
    ]);
    expect(formatReportSummary(summary)).toContain(
      '🥈 Casey: 0 activities · 1 meeting set',
    );
  });

  it('totals all owners once and ranks by activities then meetings then name then ID', () => {
    const activities = [
      activity('1'),
      activity('2'),
      activity('3', {
        wholesalerId: 'owner-alex-2',
        wholesalerName: 'Alex',
        activityType: 'email',
        outcome: 'follow_up_scheduled',
      }),
      activity('4', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
      activity('5', {
        wholesalerId: 'owner-alex-1',
        wholesalerName: 'Alex',
        activityType: 'meeting',
        outcome: 'not_interested',
      }),
      activity('6', {
        wholesalerId: 'unassigned',
        wholesalerName: 'Unassigned',
        activityType: '',
        outcome: '',
      }),
      activity('1'),
    ];
    const summary = buildReportSummary({ ...defaults, activities });

    expect(summary.total).toBe(6);
    expect(summary.totalMeetingsSet).toBe(0);
    expect(summary.leaderboard).toEqual([
      { ownerId: 'owner-jordan', name: 'Jordan', count: 2, meetingsSet: 0 },
      { ownerId: 'owner-alex-1', name: 'Alex', count: 1, meetingsSet: 0 },
      { ownerId: 'owner-alex-2', name: 'Alex', count: 1, meetingsSet: 0 },
      { ownerId: 'owner-taylor', name: 'Taylor', count: 1, meetingsSet: 0 },
      { ownerId: 'unassigned', name: 'Unassigned', count: 1, meetingsSet: 0 },
    ]);
    expect(
      buildReportSummary({
        ...defaults,
        activities: [...activities].reverse(),
      }),
    ).toEqual(summary);
    const text = formatReportSummary(summary);
    expect(text).toContain('🥇 Jordan: 2 activities · 0 meetings set');
    expect(text).toContain('🥈 Alex: 1 activity · 0 meetings set');
    expect(text).toContain('🥉 Alex: 1 activity · 0 meetings set');
    expect(text).toContain('4. Taylor: 1 activity · 0 meetings set');
    expect(text).toContain('5. Unassigned: 1 activity · 0 meetings set');
    expect(text).not.toContain('Private');
  });

  it('renders celebratory medals, truthful totals and one per-person ranking', () => {
    const text = formatReportSummary(buildReportSummary({
      ...defaults,
      activities: [activity('1')],
      meetingBookings: [{
        id: 'booking-1',
        bookedAt: '2026-09-09T15:00:00.000Z',
        wholesalerId: 'owner-jordan',
        wholesalerName: 'Jordan',
      }],
    }));
    expect(text).toContain('🎉 Daily outreach report — last 24 hours');
    expect(text).toContain('📊 Total activities: 1');
    expect(text).toContain('📅 Meetings set: 1');
    expect(text).toContain('🏆 Activity leaderboard');
    expect(text).toContain('🥇 Jordan: 1 activity · 1 meeting set');
    expect(text).not.toMatch(/By activity|By outcome|Meeting-booking/);
    expect(text).not.toMatch(/[🥇🥈🥉] [123]\./u);
    expect(text).toContain('Meetings counted when booked, not when scheduled.');
    // The per-person ranking stays counts-only; ARR belongs to its own section.
    expect(
      text.split('\n').filter((line) => /^[\u{1f947}\u{1f948}\u{1f949}]|^\d+\./u.test(line)),
    ).toEqual(['\u{1f947} Jordan: 1 activity \u00b7 1 meeting set']);
    expect(text).not.toMatch(/Private/);
  });

  it.each(['daily', 'weekly', 'monthly'] as const)(
    'includes the %s start but excludes older, invalid, end-boundary and future rows',
    (period) => {
      const window = getReportWindow({ ...defaults, period });
      const summary = buildReportSummary({
        ...defaults,
        period,
        activities: [
          activity('start', { occurredAt: window.start.toISOString() }),
          activity('older', {
            occurredAt: new Date(window.start.getTime() - 1).toISOString(),
          }),
          activity('end', { occurredAt: window.end.toISOString() }),
          activity('future', {
            occurredAt: new Date(window.end.getTime() + 1).toISOString(),
          }),
          activity('invalid', { occurredAt: 'not-a-timestamp' }),
        ],
      });
      expect(summary.total).toBe(1);
    },
  );

  it.each(['daily', 'weekly', 'monthly'] as const)(
    'includes the %s booking start and excludes older, invalid, end-boundary and future bookings',
    (period) => {
      const window = getReportWindow({ ...defaults, period });
      const summary = buildReportSummary({
        ...defaults,
        period,
        activities: [],
        meetingBookings: [
          window.start.toISOString(),
          new Date(window.start.getTime() - 1).toISOString(),
          window.end.toISOString(),
          new Date(window.end.getTime() + 1).toISOString(),
          'not-a-timestamp',
        ].map((bookedAt, index) => ({
          id: `booking-${index}`,
          bookedAt,
          wholesalerId: 'owner-jordan',
          wholesalerName: 'Jordan',
        })),
      });
      expect(summary.totalMeetingsSet).toBe(1);
      expect(summary.total).toBe(0);
    },
  );

  it('ranks every booking owner including missing identities, with stable ties independent of source order', () => {
    const meetingBookings = [
      { id: '1', wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' },
      { id: '2', wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' },
      { id: '3', wholesalerId: 'owner-alex-2', wholesalerName: 'Alex' },
      { id: '4', wholesalerId: 'owner-alex-1', wholesalerName: 'Alex' },
      { id: '5', wholesalerId: ' ', wholesalerName: '\n ' },
    ].map((booking) => ({ ...booking, bookedAt: '2026-09-09T15:00:00.000Z' }));
    const input = { ...defaults, activities: [], meetingBookings };
    const summary = buildReportSummary(input);
    expect(summary.leaderboard).toEqual([
      { ownerId: 'owner-taylor', name: 'Taylor', count: 0, meetingsSet: 2 },
      { ownerId: 'owner-alex-1', name: 'Alex', count: 0, meetingsSet: 1 },
      { ownerId: 'owner-alex-2', name: 'Alex', count: 0, meetingsSet: 1 },
      { ownerId: 'unassigned', name: 'Unassigned', count: 0, meetingsSet: 1 },
    ]);
    expect(buildReportSummary({
      ...input,
      meetingBookings: [...meetingBookings].reverse(),
    })).toEqual(summary);
  });

  it.each([
    [
      '2026-03-09T17:00:00.000Z',
      '2026-03-02T17:00:00.000Z',
      ['2026-03-07T05:59:59.999Z', '2026-03-09T05:00:00.000Z'],
      ['2026-03-07T06:00:00.000Z', '2026-03-09T04:59:59.999Z'],
    ],
    [
      '2026-11-02T18:00:00.000Z',
      '2026-10-26T18:00:00.000Z',
      ['2026-10-31T04:59:59.999Z', '2026-11-02T06:00:00.000Z'],
      ['2026-10-31T05:00:00.000Z', '2026-11-02T05:59:59.999Z'],
    ],
  ] as const)(
    'excludes Chicago weekends across the daylight saving transition ending %s',
    (now, start, weekdays, weekends) => {
      const summary = buildReportSummary({
        ...defaults,
        period: 'weekly',
        now: new Date(now),
        activities: [...weekdays, ...weekends].map((occurredAt, index) =>
          activity(String(index), { occurredAt }),
        ),
        meetingBookings: [...weekdays, ...weekends].map((bookedAt, index) => ({
          id: String(index),
          bookedAt,
          scheduledAt: '2026-12-01T12:00:00.000Z',
          wholesalerId: 'owner-jordan',
          wholesalerName: 'Jordan',
        })),
      });
      expect(summary.start.toISOString()).toBe(start);
      expect(summary.total).toBe(2);
      expect(summary.totalMeetingsSet).toBe(2);
    },
  );

  it('uses the configured local weekday instead of the UTC date or hard-coded Chicago time', () => {
    const activities = [
      activity('saturday-utc', { occurredAt: '2026-09-05T03:00:00.000Z' }),
    ];
    const meetingBookings = activities.map(({ id, occurredAt, wholesalerId, wholesalerName }) => ({
      id, bookedAt: occurredAt, wholesalerId, wholesalerName,
    }));
    expect(
      buildReportSummary({ ...defaults, period: 'weekly', activities }).total,
    ).toBe(1);
    expect(
      buildReportSummary({
        ...defaults,
        period: 'weekly',
        timeZone: 'Asia/Tokyo',
        activities,
      }).total,
    ).toBe(0);
    expect(buildReportSummary({ ...defaults, period: 'weekly', activities: [], meetingBookings }).totalMeetingsSet).toBe(1);
    expect(buildReportSummary({ ...defaults, period: 'weekly', timeZone: 'Asia/Tokyo', activities: [], meetingBookings }).totalMeetingsSet).toBe(0);
  });

  it.each(['2026-03-09T05:30:00.000Z', '2026-11-02T06:30:00.000Z'])(
    'keeps the daily window exactly 24 hours across daylight saving at %s',
    (instant) => {
      const now = new Date(instant);
      const { start, end } = getReportWindow({ period: 'daily', now });
      expect(end.getTime() - start.getTime()).toBe(86_400_000);
      expect(end).toEqual(now);
    },
  );

  it('uses a rolling 30-day month rather than a calendar month or the weekly window', () => {
    const summary = buildReportSummary({
      ...defaults,
      period: 'monthly',
      now: new Date('2026-03-01T12:00:00.000Z'),
      activities: [
        activity('january', { occurredAt: '2026-01-31T12:00:00.000Z' }),
      ],
    });
    expect(summary.start.toISOString()).toBe('2026-01-30T12:00:00.000Z');
    expect(summary.total).toBe(1);
  });

  it('renders a useful empty report with zeroed totals and both empty states', () => {
    const text = formatReportSummary(
      buildReportSummary({ ...defaults, activities: [] }),
    );
    expect(text).toContain('Daily outreach report — last 24 hours');
    expect(text).toContain('America/Chicago');
    expect(text).toContain('Total activities: 0');
    expect(text).toContain('Meetings set: 0');
    expect(text).toContain('No outreach logged in this period.');
    expect(text).toContain('No meetings booked in this period.');
  });

  it('keeps owner labels on single lines in plain Telegram text', () => {
    const summary = buildReportSummary({
      ...defaults,
      activities: [
        activity('1', {
          wholesalerName: ' Jordan\nExample ',
          activityType: 'phone_call\t',
          outcome: '\nconnected ',
        }),
      ],
    });
    expect(formatReportSummary(summary)).toContain('🥇 Jordan Example: 1');
  });

  it('lists every EW with the zero ARR placeholder and leaves BDRs out', () => {
    const summary = buildReportSummary({
      ...defaults,
      activities: [activity('1')],
      externalWholesalerRevenue: section([
        wholesaler('id-bdr', 'BDR', 'Sam'),
        wholesaler('id-ew-2', 'EW', 'Casey'),
        wholesaler('id-ew-1', 'EW', 'Alex'),
        wholesaler('id-unset', null, 'Robin'),
        wholesaler('id-default', DEFAULT_WHOLESALER_ROLE, 'Kim'),
      ]),
    });

    expect(PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE).toBe(0);
    expect(summary.externalWholesalerRevenue).toEqual({
      status: 'resolved',
      wholesalers: [
        {
          wholesalerId: 'id-ew-1',
          name: 'Alex',
          attributedAnnualRecurringRevenue: 0,
        },
        {
          wholesalerId: 'id-ew-2',
          name: 'Casey',
          attributedAnnualRecurringRevenue: 0,
        },
      ],
    });
    const text = formatReportSummary(summary);
    expect(text).toContain('💰 ARR attributed per EW');
    expect(text).toContain(
      'No ARR source is connected yet, so every figure reads $0.',
    );
    expect(text).toContain('• Alex: $0');
    expect(text).toContain('• Casey: $0');
    for (const excluded of ['Sam', 'Robin', 'Kim'])
      expect(text).not.toContain(excluded);
  });

  it.each([' ew ', 'EW', 'eW', ' Ew  ', '\tew\n', '  ew\t '])(
    'reads the hand-entered role %j as EW',
    (wholesalerRole) => {
      expect(
        section([wholesaler('id-ew', wholesalerRole, 'Alex')]),
      ).toEqual({
        status: 'resolved',
        wholesalers: [
          {
            wholesalerId: 'id-ew',
            name: 'Alex',
            attributedAnnualRecurringRevenue: 0,
          },
        ],
      });
    },
  );

  it.each([
    'BDR',
    'bdr',
    ' Bdr ',
    DEFAULT_WHOLESALER_ROLE,
    'EWW',
    'new',
    'e w',
    '',
    '   ',
    null,
  ])('keeps the role %j out of the ARR section', (wholesalerRole) => {
    expect(section([wholesaler('id-other', wholesalerRole, 'Sam')])).toEqual({
      status: 'resolved',
      wholesalers: [],
    });
  });

  it('explains the empty EW set rather than dropping or half-rendering the section', () => {
    const text = formatReportSummary(
      buildReportSummary({
        ...defaults,
        activities: [],
        externalWholesalerRevenue: section([wholesaler('id-bdr', 'BDR', 'Sam')]),
      }),
    );
    expect(text).toContain('💰 ARR attributed per EW');
    expect(text).toContain(
      'No wholesaler with the EW role appears in this period, so there is nothing to attribute.',
    );
    expect(text).not.toContain('$0');
    expect(text).not.toContain('could not be read');
  });

  it('tells an unreadable role apart from an empty EW set', () => {
    const text = formatReportSummary(
      buildReportSummary({ ...defaults, activities: [] }),
    );
    expect(text).toContain('💰 ARR attributed per EW');
    expect(text).toContain(
      'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
    );
    expect(text).not.toContain('nothing to attribute');
    expect(text).not.toContain('$0');
  });

  it('keeps an EW label on one line and labels an unnamed record', () => {
    const resolved = section([
      wholesaler('id-1', 'EW', ' Alex\nExample '),
      wholesaler('id-2', 'EW', '   '),
    ]);
    expect(
      resolved.status === 'resolved'
        ? resolved.wholesalers.map(({ name }) => name)
        : [],
    ).toEqual(['Alex Example', 'Unnamed external wholesaler']);
  });

  it('keeps per-person counts identical whether or not EWs exist', () => {
    const shared = {
      ...defaults,
      activities: [
        activity('1'),
        activity('2', { wholesalerId: 'owner-alex', wholesalerName: 'Alex' }),
      ],
      meetingBookings: [
        {
          id: 'booking-1',
          bookedAt: '2026-09-09T15:00:00.000Z',
          wholesalerId: 'owner-alex',
          wholesalerName: 'Alex',
        },
      ],
    };
    const withoutRoles = buildReportSummary({
      ...shared,
      externalWholesalerRevenue: section([]),
    });
    const withRoles = buildReportSummary({
      ...shared,
      externalWholesalerRevenue: section([
        wholesaler('owner-alex', 'EW', 'Alex'),
        wholesaler('owner-jordan', 'BDR', 'Jordan'),
      ]),
    });

    expect(withRoles.total).toBe(withoutRoles.total);
    expect(withRoles.totalMeetingsSet).toBe(withoutRoles.totalMeetingsSet);
    expect(withRoles.leaderboard).toEqual(withoutRoles.leaderboard);
    const leaderboardLines = (summary: typeof withRoles) =>
      formatReportSummary(summary)
        .split('\n')
        .filter((line) => /^[🥇🥈🥉]|^\d+\./u.test(line));
    expect(leaderboardLines(withRoles)).toEqual(leaderboardLines(withoutRoles));
    expect(leaderboardLines(withRoles)).toEqual([
      '🥇 Alex: 1 activity · 1 meeting set',
      '🥈 Jordan: 1 activity · 0 meetings set',
    ]);
  });

  it('reads roles only for the wholesalers the report already returned', async () => {
    const findRolesByIds = vi.fn().mockResolvedValue([
      wholesaler('owner-jordan', 'EW', 'Jordan'),
    ]);
    const text = await readReportSummary({
      ...defaults,
      repository: {
        listActivities: vi
          .fn()
          .mockResolvedValue([activity('1'), activity('2')]),
      },
      meetingRepository: {
        listMeetingBookings: vi.fn().mockResolvedValue([
          {
            id: 'booking-1',
            bookedAt: '2026-09-09T15:00:00.000Z',
            wholesalerId: 'owner-booker',
            wholesalerName: 'Casey',
          },
        ]),
      },
      wholesalerRoleReader: { findRolesByIds },
    });

    expect(findRolesByIds).toHaveBeenCalledOnce();
    expect(findRolesByIds).toHaveBeenCalledWith([
      'owner-jordan',
      'owner-booker',
    ]);
    expect(text).toContain('• Jordan: $0');
  });

  it('never reads roles when the period returned nobody', async () => {
    const findRolesByIds = vi.fn();
    const text = await readReportSummary({
      ...defaults,
      repository: { listActivities: vi.fn().mockResolvedValue([]) },
      meetingRepository: { listMeetingBookings: vi.fn().mockResolvedValue([]) },
      wholesalerRoleReader: { findRolesByIds },
    });

    expect(findRolesByIds).not.toHaveBeenCalled();
    expect(text).toContain(
      'No wholesaler with the EW role appears in this period, so there is nothing to attribute.',
    );
  });

  // The regression that took the production bot down: a failed role read used
  // to throw out of readReportSummary, fail the installed-report verification
  // and delete the live Telegram webhook.
  it.each([
    ['a rejected read', () => vi.fn().mockRejectedValue(new Error('denied'))],
    [
      'a synchronously thrown read',
      () =>
        vi.fn(() => {
          throw new Error('Wholesaler query is not permitted');
        }),
    ],
    ['a read that answered with nothing', () => vi.fn().mockResolvedValue(undefined)],
    [
      'a read that answered with a malformed roster',
      () => vi.fn().mockResolvedValue([null]),
    ],
  ])('degrades the ARR section on %s and still delivers the report', async (
    _name,
    createReader,
  ) => {
    const listActivities = vi.fn().mockResolvedValue([activity('1')]);
    const listMeetingBookings = vi.fn().mockResolvedValue([
      {
        id: 'booking-1',
        bookedAt: '2026-09-09T15:00:00.000Z',
        wholesalerId: 'owner-jordan',
        wholesalerName: 'Jordan',
      },
    ]);
    const text = await readReportSummary({
      ...defaults,
      repository: { listActivities },
      meetingRepository: { listMeetingBookings },
      wholesalerRoleReader: { findRolesByIds: createReader() },
    });

    expect(text).toContain('🎉 Daily outreach report — last 24 hours');
    expect(text).toContain('📊 Total activities: 1');
    expect(text).toContain('📅 Meetings set: 1');
    expect(text).toContain('🏆 Activity leaderboard');
    expect(text).toContain('🥇 Jordan: 1 activity · 1 meeting set');
    expect(text).toContain('💰 ARR attributed per EW');
    expect(text).toContain(
      'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
    );
    // Never leak why: this text is delivered to a Telegram group.
    expect(text).not.toMatch(/denied|permitted|Error/);
  });

  it('degrades rather than hanging when the role read never returns', async () => {
    vi.useFakeTimers();
    try {
      const pending = readReportSummary({
        ...defaults,
        repository: {
          listActivities: vi.fn().mockResolvedValue([activity('1')]),
        },
        meetingRepository: {
          listMeetingBookings: vi.fn().mockResolvedValue([]),
        },
        wholesalerRoleReader: {
          findRolesByIds: vi.fn(() => new Promise<never>(() => {})),
        },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      const text = await pending;
      expect(text).toContain('📊 Total activities: 1');
      expect(text).toContain(
        'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // Pins the whole section body, not just fragments: the report is delivered
  // verbatim to a Telegram group, so an unnoticed extra line is a product
  // change nobody asked for.
  it.each([
    [
      'listed EWs',
      [wholesaler('id-ew-1', 'EW', 'Alex'), wholesaler('id-bdr', 'BDR', 'Sam')],
      [
        '💰 ARR attributed per EW',
        'No ARR source is connected yet, so every figure reads $0.',
        '• Alex: $0',
        'Total ARR: $0',
      ],
    ],
    [
      'no EW in the period',
      [wholesaler('id-bdr', 'BDR', 'Sam')],
      [
        '💰 ARR attributed per EW',
        'No wholesaler with the EW role appears in this period, so there is nothing to attribute.',
      ],
    ],
  ] as const)('renders exactly the %s section and nothing more', (
    _name,
    wholesalerRoles,
    expected,
  ) => {
    const lines = formatReportSummary(
      buildReportSummary({
        ...defaults,
        activities: [activity('1')],
        externalWholesalerRevenue: section([...wholesalerRoles]),
      }),
    ).split('\n');
    const heading = lines.indexOf('💰 ARR attributed per EW');
    expect(heading).toBeGreaterThan(-1);
    expect(lines.slice(heading)).toEqual([...expected]);
  });

  it('renders exactly the unavailable section and nothing more', () => {
    const lines = formatReportSummary(
      buildReportSummary({ ...defaults, activities: [activity('1')] }),
    ).split('\n');
    const heading = lines.indexOf('💰 ARR attributed per EW');
    expect(lines.slice(heading)).toEqual([
      '💰 ARR attributed per EW',
      'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
    ]);
  });
});
