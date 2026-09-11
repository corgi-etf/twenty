import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_WHOLESALER_ROLE } from 'src/constants';
import {
  buildExternalWholesalerDirectory,
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

const booking = (
  id: string,
  overrides: Partial<{
    bookedAt: string;
    scheduledAt: string;
    wholesalerId: string;
    wholesalerName: string;
  }> = {},
) => ({
  id,
  bookedAt: '2026-09-09T15:00:00.000Z',
  wholesalerId: 'owner-jordan',
  wholesalerName: 'Jordan',
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

const directory = (wholesalerRoles: WholesalerRecord[]) =>
  buildExternalWholesalerDirectory(wholesalerRoles);

const defaults = {
  period: 'daily' as const,
  now: new Date('2026-09-09T16:30:00.000Z'),
  timeZone: 'America/Chicago',
  meetingBookings: [],
};

const rankedLines = (text: string) =>
  text.split('\n').filter((line) => /^[🥇🥈🥉]|^\d+\./u.test(line));

describe('outreach report windows', () => {
  it.each([
    ['daily', '2026-09-09T10:00:00.000Z', '2026-09-10T10:00:00.000Z'],
    ['weekly', '2026-09-03T10:00:00.000Z', '2026-09-10T10:00:00.000Z'],
    ['monthly', '2026-08-11T10:00:00.000Z', '2026-09-10T10:00:00.000Z'],
  ] as const)(
    'runs the %s window between local 5am boundaries rather than rolling back from now',
    (period, start, end) => {
      expect(getReportWindow({ ...defaults, period })).toEqual({
        start: new Date(start),
        end: new Date(end),
      });
    },
  );

  it('reports the reporting day already under way before 5am, not the one starting later', () => {
    expect(
      getReportWindow({
        ...defaults,
        now: new Date('2026-09-09T09:59:59.999Z'),
      }),
    ).toEqual({
      start: new Date('2026-09-08T10:00:00.000Z'),
      end: new Date('2026-09-09T10:00:00.000Z'),
    });
    expect(
      getReportWindow({
        ...defaults,
        now: new Date('2026-09-09T10:00:00.000Z'),
      }),
    ).toEqual({
      start: new Date('2026-09-09T10:00:00.000Z'),
      end: new Date('2026-09-10T10:00:00.000Z'),
    });
  });

  // The window follows the wall clock, so a reporting day is 23 or 25 hours
  // long across a daylight saving transition instead of exactly 24.
  it.each([
    ['2026-03-07T18:00:00.000Z', 23, 167, 719],
    ['2026-10-31T18:00:00.000Z', 25, 169, 721],
    ['2026-09-09T16:30:00.000Z', 24, 168, 720],
  ] as const)(
    'keeps whole local reporting days at %s across daylight saving',
    (now, daily, weekly, monthly) => {
      for (const [period, hours] of [
        ['daily', daily],
        ['weekly', weekly],
        ['monthly', monthly],
      ] as const) {
        const { start, end } = getReportWindow({
          ...defaults,
          period,
          now: new Date(now),
        });
        expect((end.getTime() - start.getTime()) / 3_600_000).toBe(hours);
        for (const boundary of [start, end]) {
          expect(
            new Intl.DateTimeFormat('en-US', {
              timeZone: defaults.timeZone,
              hourCycle: 'h23',
              hour: '2-digit',
            }).format(boundary),
          ).toBe('05');
        }
      }
    },
  );

  it('anchors the boundary in the configured zone rather than UTC', () => {
    expect(
      getReportWindow({
        ...defaults,
        timeZone: 'Asia/Tokyo',
      }),
    ).toEqual({
      start: new Date('2026-09-08T20:00:00.000Z'),
      end: new Date('2026-09-09T20:00:00.000Z'),
    });
  });
});

describe('outreach report summaries', () => {
  it('reads all-owner bookings and activities with the same 5am window and never masks a failed booking read', async () => {
    const repository = { listActivities: vi.fn().mockResolvedValue([]) };
    const meetingRepository = {
      listMeetingBookings: vi
        .fn()
        .mockResolvedValue([
          booking('booking-1', {
            wholesalerId: 'owner-booker',
            wholesalerName: 'Casey',
          }),
        ]),
    };
    const input = { ...defaults, repository, meetingRepository };
    const text = await readReportSummary(input);
    const window = {
      start: '2026-09-09T10:00:00.000Z',
      end: '2026-09-10T10:00:00.000Z',
    };
    expect(repository.listActivities).toHaveBeenCalledWith(window);
    expect(meetingRepository.listMeetingBookings).toHaveBeenCalledWith(window);
    expect(text).toContain('Meetings set: 1');
    expect(text).toContain('Total activities: 0');
    meetingRepository.listMeetingBookings.mockRejectedValue(
      new Error('Meeting read unavailable'),
    );
    await expect(readReportSummary(input)).rejects.toThrow(
      'Meeting read unavailable',
    );
    meetingRepository.listMeetingBookings.mockResolvedValue(undefined);
    await expect(readReportSummary(input)).rejects.toThrow();
  });

  it('counts meetings by booking time independently of activity totals and scheduled dates', () => {
    const meetingBookings = [
      booking('booking-1', { scheduledAt: '2026-10-01T15:00:00.000Z' }),
      booking('booking-2', {
        wholesalerId: 'owner-booker',
        wholesalerName: 'Casey',
      }),
      booking('old-booking', {
        bookedAt: '2026-08-01T15:00:00.000Z',
        scheduledAt: '2026-09-09T15:00:00.000Z',
      }),
    ];
    const summary = buildReportSummary({
      ...defaults,
      activities: [activity('booking-1')],
      meetingBookings: [...meetingBookings, meetingBookings[0]!],
    });

    expect(summary.total).toBe(1);
    expect(summary.totalMeetingsSet).toBe(2);
    expect(summary.leaderboard).toEqual([
      {
        label: null,
        owners: [
          {
            ownerId: 'owner-jordan',
            name: 'Jordan',
            count: 1,
            calls: 1,
            emails: 0,
            linkedin: 0,
            meetingsSet: 1,
          },
          {
            ownerId: 'owner-booker',
            name: 'Casey',
            count: 0,
            calls: 0,
            emails: 0,
            linkedin: 0,
            meetingsSet: 1,
          },
        ],
      },
    ]);
    expect(formatReportSummary(summary)).toContain(
      '🥈 Casey: (0/0/0) · 1 meeting set',
    );
  });

  it('splits each per-person count into calls, emails and LinkedIn without losing the total', () => {
    const types = [
      'PHONE_CALL',
      'phone_call',
      'EMAIL',
      'linkedin',
      'MEETING',
      'other',
      'Phone_Call',
      ' phone_call ',
      '',
    ];
    const summary = buildReportSummary({
      ...defaults,
      activities: types.map((activityType, index) =>
        activity(String(index), { activityType }),
      ),
    });

    expect(summary.total).toBe(types.length);
    expect(summary.leaderboard[0]?.owners[0]).toMatchObject({
      count: 9,
      calls: 4,
      emails: 1,
      linkedin: 1,
    });
    // MEETING, OTHER and the empty value still count toward the total and are
    // simply absent from the triple.
    expect(formatReportSummary(summary)).toContain(
      '🥇 Jordan: (4/1/1) · 0 meetings set',
    );
  });

  it('ranks by meetings set, then activities, then name, then ID, independent of source order', () => {
    const activities = [
      activity('1', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
      activity('2', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
      activity('3', {
        wholesalerId: 'owner-alex-2',
        wholesalerName: 'Alex',
        activityType: 'email',
      }),
      activity('4', {
        wholesalerId: 'owner-alex-1',
        wholesalerName: 'Alex',
        activityType: 'email',
      }),
      activity('5', { wholesalerId: 'owner-robin', wholesalerName: 'Robin' }),
      activity('1', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
    ];
    const meetingBookings = [
      booking('m-1', { wholesalerId: 'owner-robin', wholesalerName: 'Robin' }),
      booking('m-2', { wholesalerId: 'owner-robin', wholesalerName: 'Robin' }),
      booking('m-3', { wholesalerId: 'owner-alex-1', wholesalerName: 'Alex' }),
    ];
    const input = { ...defaults, activities, meetingBookings };
    const summary = buildReportSummary(input);

    expect(
      summary.leaderboard[0]?.owners.map(({ ownerId, meetingsSet, count }) => [
        ownerId,
        meetingsSet,
        count,
      ]),
    ).toEqual([
      ['owner-robin', 2, 1],
      ['owner-alex-1', 1, 1],
      ['owner-taylor', 0, 2],
      ['owner-alex-2', 0, 1],
    ]);
    expect(
      buildReportSummary({
        ...input,
        activities: [...activities].reverse(),
        meetingBookings: [...meetingBookings].reverse(),
      }),
    ).toEqual(summary);
    expect(rankedLines(formatReportSummary(summary))).toEqual([
      '🥇 Robin: (1/0/0) · 2 meetings set',
      '🥈 Alex: (0/1/0) · 1 meeting set',
      '🥉 Taylor: (2/0/0) · 0 meetings set',
      '4. Alex: (0/1/0) · 0 meetings set',
    ]);
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
        ].map((bookedAt, index) => booking(`booking-${index}`, { bookedAt })),
      });
      expect(summary.totalMeetingsSet).toBe(1);
      expect(summary.total).toBe(0);
    },
  );

  it('ranks every booking owner including missing identities, with stable ties independent of source order', () => {
    const meetingBookings = [
      booking('1', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
      booking('2', { wholesalerId: 'owner-taylor', wholesalerName: 'Taylor' }),
      booking('3', { wholesalerId: 'owner-alex-2', wholesalerName: 'Alex' }),
      booking('4', { wholesalerId: 'owner-alex-1', wholesalerName: 'Alex' }),
      booking('5', { wholesalerId: ' ', wholesalerName: '\n ' }),
    ];
    const input = { ...defaults, activities: [], meetingBookings };
    const summary = buildReportSummary(input);
    expect(
      summary.leaderboard[0]?.owners.map(({ ownerId, name, meetingsSet }) => [
        ownerId,
        name,
        meetingsSet,
      ]),
    ).toEqual([
      ['owner-taylor', 'Taylor', 2],
      ['owner-alex-1', 'Alex', 1],
      ['owner-alex-2', 'Alex', 1],
      ['unassigned', 'Unassigned', 1],
    ]);
    expect(
      buildReportSummary({
        ...input,
        meetingBookings: [...meetingBookings].reverse(),
      }),
    ).toEqual(summary);
  });

  it.each([
    [
      '2026-03-09T17:00:00.000Z',
      '2026-03-03T11:00:00.000Z',
      ['2026-03-06T05:59:59.999Z', '2026-03-09T05:00:00.000Z'],
      ['2026-03-07T06:00:00.000Z', '2026-03-09T04:59:59.999Z'],
    ],
    [
      '2026-11-02T18:00:00.000Z',
      '2026-10-27T10:00:00.000Z',
      ['2026-10-30T04:59:59.999Z', '2026-11-02T06:00:00.000Z'],
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
        meetingBookings: [...weekdays, ...weekends].map((bookedAt, index) =>
          booking(String(index), {
            bookedAt,
            scheduledAt: '2026-12-01T12:00:00.000Z',
          }),
        ),
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
    const meetingBookings = activities.map(
      ({ id, occurredAt, wholesalerId, wholesalerName }) =>
        booking(id, { bookedAt: occurredAt, wholesalerId, wholesalerName }),
    );
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
    expect(
      buildReportSummary({
        ...defaults,
        period: 'weekly',
        activities: [],
        meetingBookings,
      }).totalMeetingsSet,
    ).toBe(1);
    expect(
      buildReportSummary({
        ...defaults,
        period: 'weekly',
        timeZone: 'Asia/Tokyo',
        activities: [],
        meetingBookings,
      }).totalMeetingsSet,
    ).toBe(0);
  });

  it('uses a rolling 30 reporting days rather than a calendar month or the weekly window', () => {
    const summary = buildReportSummary({
      ...defaults,
      period: 'monthly',
      now: new Date('2026-03-01T12:00:00.000Z'),
      activities: [
        activity('january', { occurredAt: '2026-01-31T12:00:00.000Z' }),
      ],
    });
    expect(summary.start.toISOString()).toBe('2026-01-31T11:00:00.000Z');
    expect(summary.total).toBe(1);
  });

  it('keeps owner labels on single lines in plain Telegram text', () => {
    const summary = buildReportSummary({
      ...defaults,
      activities: [
        activity('1', {
          wholesalerName: ' Jordan\nExample ',
          outcome: '\nconnected ',
        }),
      ],
    });
    expect(formatReportSummary(summary)).toContain('🥇 Jordan Example: (1/0/0)');
  });
});

describe('leaderboard role groups', () => {
  const shared = {
    ...defaults,
    activities: [
      activity('1', { wholesalerId: 'owner-bdr', wholesalerName: 'Sam' }),
      activity('2', {
        wholesalerId: 'owner-ew',
        wholesalerName: 'Alex',
        activityType: 'email',
      }),
      activity('3', {
        wholesalerId: 'owner-unclassified',
        wholesalerName: 'Robin',
        activityType: 'linkedin',
      }),
    ],
    meetingBookings: [
      booking('m-1', { wholesalerId: 'owner-ew', wholesalerName: 'Alex' }),
    ],
  };

  it('splits the leaderboard into BDR and EW from the role read alone', () => {
    const summary = buildReportSummary({
      ...shared,
      externalWholesalers: directory([
        wholesaler('owner-bdr', 'BDR', 'Sam'),
        wholesaler('owner-ew', 'EW', 'Alex'),
        wholesaler('owner-unclassified', DEFAULT_WHOLESALER_ROLE, 'Robin'),
      ]),
    });

    expect(
      summary.leaderboard.map(({ label, owners }) => [
        label,
        owners.map(({ name }) => name),
      ]),
    ).toEqual([
      ['BDR', ['Robin', 'Sam']],
      ['EW', ['Alex']],
    ]);
    expect(formatReportSummary(summary).split('\n').slice(7, 13)).toEqual([
      '🏆 Activity leaderboard (calls/emails/linkedin)',
      'BDR',
      '🥇 Robin: (0/0/1) · 0 meetings set',
      '🥈 Sam: (1/0/0) · 0 meetings set',
      'EW',
      '🥇 Alex: (0/1/0) · 1 meeting set',
    ]);
  });

  // The role is the only thing that classifies anyone; nothing in this app
  // holds a list of people, so an unclassified owner must still be ranked.
  it.each([
    ['an unset role', null],
    ['the legacy default role', DEFAULT_WHOLESALER_ROLE],
    ['a role this app was never taught', 'Sales engineer'],
    ['a blank role', '   '],
  ])('keeps an owner with %s in the BDR group', (_name, wholesalerRole) => {
    const summary = buildReportSummary({
      ...shared,
      externalWholesalers: directory([
        wholesaler('owner-bdr', 'BDR', 'Sam'),
        wholesaler('owner-ew', 'EW', 'Alex'),
        wholesaler('owner-unclassified', wholesalerRole, 'Robin'),
      ]),
    });
    expect(
      summary.leaderboard.find(({ label }) => label === 'BDR')?.owners,
    ).toEqual([
      expect.objectContaining({ name: 'Robin' }),
      expect.objectContaining({ name: 'Sam' }),
    ]);
  });

  it('keeps an owner the role read never returned in the BDR group', () => {
    const summary = buildReportSummary({
      ...shared,
      externalWholesalers: directory([wholesaler('owner-ew', 'EW', 'Alex')]),
    });
    expect(
      summary.leaderboard.map(({ label, owners }) => [
        label,
        owners.map(({ name }) => name),
      ]),
    ).toEqual([
      ['BDR', ['Robin', 'Sam']],
      ['EW', ['Alex']],
    ]);
  });

  it('ranks one ungrouped list rather than claiming a role it could not read', () => {
    const summary = buildReportSummary(shared);
    expect(summary.leaderboard.map(({ label }) => label)).toEqual([null]);
    expect(rankedLines(formatReportSummary(summary))).toEqual([
      '🥇 Alex: (0/1/0) · 1 meeting set',
      '🥈 Robin: (0/0/1) · 0 meetings set',
      '🥉 Sam: (1/0/0) · 0 meetings set',
    ]);
    expect(formatReportSummary(summary)).not.toMatch(/^BDR$|^EW$/m);
  });

  it('omits a group nobody is in and keeps per-person counts identical either way', () => {
    const withRoles = buildReportSummary({
      ...shared,
      externalWholesalers: directory([wholesaler('owner-bdr', 'BDR', 'Sam')]),
    });
    const withoutRoles = buildReportSummary(shared);

    expect(withRoles.leaderboard.map(({ label }) => label)).toEqual(['BDR']);
    expect(withRoles.total).toBe(withoutRoles.total);
    expect(withRoles.totalMeetingsSet).toBe(withoutRoles.totalMeetingsSet);
    expect(withRoles.leaderboard.flatMap(({ owners }) => owners)).toEqual(
      withoutRoles.leaderboard.flatMap(({ owners }) => owners),
    );
  });
});

describe('external wholesaler sections', () => {
  const shared = {
    ...defaults,
    activities: [
      activity('1', { wholesalerId: 'owner-derek', wholesalerName: 'Derek' }),
      activity('2', { wholesalerId: 'owner-kevin', wholesalerName: 'Kevin' }),
    ],
    meetingBookings: [
      booking('m-1', { wholesalerId: 'owner-derek', wholesalerName: 'Derek' }),
      booking('m-2', { wholesalerId: 'owner-derek', wholesalerName: 'Derek' }),
      booking('m-3', { wholesalerId: 'owner-kevin', wholesalerName: 'Kevin' }),
    ],
  };

  it('ranks meetings taken and ARR per EW with medals and leaves BDRs out', () => {
    const summary = buildReportSummary({
      ...shared,
      externalWholesalers: directory([
        wholesaler('owner-derek', 'EW', 'Derek'),
        wholesaler('owner-kevin', ' ew ', 'Kevin'),
        wholesaler('owner-sam', 'BDR', 'Sam'),
      ]),
    });

    expect(PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE).toBe(0);
    expect(summary.meetingsTakenByExternalWholesalers).toEqual({
      status: 'resolved',
      wholesalers: [
        { wholesalerId: 'owner-derek', name: 'Derek', meetings: 2 },
        { wholesalerId: 'owner-kevin', name: 'Kevin', meetings: 1 },
      ],
    });
    expect(summary.externalWholesalerRevenue).toEqual({
      status: 'resolved',
      wholesalers: [
        {
          wholesalerId: 'owner-derek',
          name: 'Derek',
          attributedAnnualRecurringRevenue: 0,
        },
        {
          wholesalerId: 'owner-kevin',
          name: 'Kevin',
          attributedAnnualRecurringRevenue: 0,
        },
      ],
    });
    const lines = formatReportSummary(summary).split('\n');
    expect(lines.slice(lines.indexOf('Meetings taken by EW'))).toEqual([
      'Meetings taken by EW',
      '🥇 Derek: 2',
      '🥈 Kevin: 1',
      '',
      'ARR attributed per EW',
      '🥇 Derek: $0',
      '🥈 Kevin: $0',
    ]);
    expect(lines).not.toContain('Sam');
  });

  it('lists an EW who took no meeting rather than dropping the row', () => {
    const summary = buildReportSummary({
      ...shared,
      meetingBookings: [],
      externalWholesalers: directory([
        wholesaler('owner-kevin', 'EW', 'Kevin'),
        wholesaler('owner-derek', 'EW', 'Derek'),
      ]),
    });
    const lines = formatReportSummary(summary).split('\n');
    expect(lines.slice(lines.indexOf('Meetings taken by EW'))).toEqual([
      'Meetings taken by EW',
      '🥇 Derek: 0',
      '🥈 Kevin: 0',
      '',
      'ARR attributed per EW',
      '🥇 Derek: $0',
      '🥈 Kevin: $0',
    ]);
  });

  it('explains the empty EW set rather than dropping or half-rendering either section', () => {
    const lines = formatReportSummary(
      buildReportSummary({
        ...shared,
        externalWholesalers: directory([wholesaler('owner-sam', 'BDR', 'Sam')]),
      }),
    ).split('\n');

    expect(lines.slice(lines.indexOf('Meetings taken by EW'))).toEqual([
      'Meetings taken by EW',
      'No wholesaler with the EW role appears in this period.',
      '',
      'ARR attributed per EW',
      'No wholesaler with the EW role appears in this period, so there is nothing to attribute.',
    ]);
    expect(lines.join('\n')).not.toContain('$0');
    expect(lines.join('\n')).not.toContain('could not be read');
  });

  it('tells an unreadable role apart from an empty EW set', () => {
    const lines = formatReportSummary(buildReportSummary(shared)).split('\n');

    expect(lines.slice(lines.indexOf('Meetings taken by EW'))).toEqual([
      'Meetings taken by EW',
      'Wholesaler roles could not be read for this report, so meetings taken by EW are unavailable.',
      '',
      'ARR attributed per EW',
      'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
    ]);
    expect(lines.join('\n')).not.toContain('nothing to attribute');
    expect(lines.join('\n')).not.toContain('$0');
  });

  // The owner struck the "no ARR source is connected" sentence and the total.
  it('renders ARR figures alone, with no explanation and no total', () => {
    const text = formatReportSummary(
      buildReportSummary({
        ...shared,
        externalWholesalers: directory([
          wholesaler('owner-derek', 'EW', 'Derek'),
        ]),
      }),
    );
    expect(text).toContain('🥇 Derek: $0');
    expect(text).not.toMatch(/No ARR source|every figure reads|Total ARR/);
  });

  it.each([' ew ', 'EW', 'eW', ' Ew  ', '\tew\n', '  ew\t '])(
    'reads the hand-entered role %j as EW',
    (wholesalerRole) => {
      expect(directory([wholesaler('id-ew', wholesalerRole, 'Alex')])).toEqual({
        status: 'resolved',
        wholesalers: [{ wholesalerId: 'id-ew', name: 'Alex' }],
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
  ])('keeps the role %j out of the EW sections', (wholesalerRole) => {
    expect(directory([wholesaler('id-other', wholesalerRole, 'Sam')])).toEqual({
      status: 'resolved',
      wholesalers: [],
    });
  });

  it('keeps an EW label on one line and labels an unnamed record', () => {
    const resolved = directory([
      wholesaler('id-1', 'EW', ' Alex\nExample '),
      wholesaler('id-2', 'EW', '   '),
    ]);
    expect(
      resolved.status === 'resolved'
        ? resolved.wholesalers.map(({ name }) => name)
        : [],
    ).toEqual(['Alex Example', 'Unnamed external wholesaler']);
  });
});

describe('report delivery', () => {
  it('renders the whole populated report verbatim', async () => {
    const activityTypes: Array<[string, string, string[]]> = [
      ['owner-nash', 'Nash Hill', ['phone_call', 'phone_call', 'phone_call', 'email', 'email', 'linkedin', 'meeting', 'other']],
      ['owner-zeke-lower', 'zeke', ['email', 'email']],
      ['owner-zeke-melvin', 'Zeke Melvin', ['linkedin']],
      ['', 'Unassigned', ['phone_call']],
      ['owner-damien', 'Damien Wiese', ['phone_call', 'email']],
      ['owner-derek', 'Derek Radcliff', ['phone_call', 'phone_call', 'phone_call', 'phone_call']],
      ['owner-kevin', 'Kevin Hennessy', ['email']],
    ];
    const activities = activityTypes.flatMap(
      ([wholesalerId, wholesalerName, types]) =>
        types.map((activityType, index) =>
          activity(`${wholesalerName}-${index}`, {
            wholesalerId,
            wholesalerName,
            activityType,
          }),
        ),
    );
    const meetingBookings = [
      ['owner-nash', 'Nash Hill'],
      ['', 'Unassigned'],
      ['', 'Unassigned'],
      ['owner-damien', 'Damien Wiese'],
      ['owner-derek', 'Derek Radcliff'],
      ['owner-derek', 'Derek Radcliff'],
      ['owner-derek', 'Derek Radcliff'],
    ].map(([wholesalerId, wholesalerName], index) =>
      booking(`booking-${index}`, {
        wholesalerId: wholesalerId!,
        wholesalerName: wholesalerName!,
      }),
    );
    const text = await readReportSummary({
      ...defaults,
      repository: { listActivities: vi.fn().mockResolvedValue(activities) },
      meetingRepository: {
        listMeetingBookings: vi.fn().mockResolvedValue(meetingBookings),
      },
      wholesalerRoleReader: {
        findRolesByIds: vi.fn().mockResolvedValue([
          wholesaler('owner-nash', 'BDR', 'Nash Hill'),
          wholesaler('owner-zeke-lower', 'bdr', 'zeke'),
          wholesaler('owner-zeke-melvin', 'BDR ', 'Zeke Melvin'),
          wholesaler('owner-damien', null, 'Damien Wiese'),
          wholesaler('owner-derek', 'EW', 'Derek Radcliff'),
          wholesaler('owner-kevin', ' ew ', 'Kevin Hennessy'),
        ]),
      },
    });

    expect(text).toBe(
      [
        '🎉 Daily outreach report — 5am to 5am',
        'Sep 9, 2026, 05:00 AM CDT → Sep 10, 2026, 05:00 AM CDT (America/Chicago)',
        'All CRM owners',
        '',
        '📊 Total activities: 19',
        '📅 Meetings set: 7',
        '',
        '🏆 Activity leaderboard (calls/emails/linkedin)',
        'BDR',
        '🥇 Unassigned: (1/0/0) · 2 meetings set',
        '🥈 Nash Hill: (3/2/1) · 1 meeting set',
        '🥉 Damien Wiese: (1/1/0) · 1 meeting set',
        '4. zeke: (0/2/0) · 0 meetings set',
        '5. Zeke Melvin: (0/0/1) · 0 meetings set',
        'EW',
        '🥇 Derek Radcliff: (4/0/0) · 3 meetings set',
        '🥈 Kevin Hennessy: (0/1/0) · 0 meetings set',
        '',
        'Meetings taken by EW',
        '🥇 Derek Radcliff: 3',
        '🥈 Kevin Hennessy: 0',
        '',
        'ARR attributed per EW',
        '🥇 Derek Radcliff: $0',
        '🥈 Kevin Hennessy: $0',
      ].join('\n'),
    );
    expect(text).not.toMatch(/Private|last 24 hours/);
  });

  it('renders the whole empty report verbatim, with both empty states', async () => {
    const findRolesByIds = vi.fn();
    const text = await readReportSummary({
      ...defaults,
      repository: { listActivities: vi.fn().mockResolvedValue([]) },
      meetingRepository: { listMeetingBookings: vi.fn().mockResolvedValue([]) },
      wholesalerRoleReader: { findRolesByIds },
    });

    expect(findRolesByIds).not.toHaveBeenCalled();
    expect(text).toBe(
      [
        '🎉 Daily outreach report — 5am to 5am',
        'Sep 9, 2026, 05:00 AM CDT → Sep 10, 2026, 05:00 AM CDT (America/Chicago)',
        'All CRM owners',
        '',
        '📊 Total activities: 0',
        '📅 Meetings set: 0',
        '',
        '🏆 Activity leaderboard (calls/emails/linkedin)',
        'No outreach logged in this period.',
        'No meetings booked in this period.',
        '',
        'Meetings taken by EW',
        'No wholesaler with the EW role appears in this period.',
        '',
        'ARR attributed per EW',
        'No wholesaler with the EW role appears in this period, so there is nothing to attribute.',
      ].join('\n'),
    );
  });

  it.each(['weekly', 'monthly'] as const)(
    'titles the %s report without a rolling-window phrase',
    (period) => {
      const text = formatReportSummary(
        buildReportSummary({ ...defaults, period, activities: [] }),
      );
      expect(text.split('\n')[0]).toBe(
        period === 'weekly'
          ? '🎉 Weekly outreach report — 7 days, 5am to 5am, excluding Saturday/Sunday'
          : '🎉 Monthly outreach report — 30 days, 5am to 5am',
      );
      expect(text).not.toMatch(/last \d+ (?:hours|days)/);
    },
  );

  it('reads roles only for the wholesalers the report already returned', async () => {
    const findRolesByIds = vi
      .fn()
      .mockResolvedValue([wholesaler('owner-jordan', 'EW', 'Jordan')]);
    const text = await readReportSummary({
      ...defaults,
      repository: {
        listActivities: vi
          .fn()
          .mockResolvedValue([activity('1'), activity('2')]),
      },
      meetingRepository: {
        listMeetingBookings: vi
          .fn()
          .mockResolvedValue([
            booking('booking-1', {
              wholesalerId: 'owner-booker',
              wholesalerName: 'Casey',
            }),
          ]),
      },
      wholesalerRoleReader: { findRolesByIds },
    });

    expect(findRolesByIds).toHaveBeenCalledOnce();
    expect(findRolesByIds).toHaveBeenCalledWith([
      'owner-jordan',
      'owner-booker',
    ]);
    expect(text).toContain('🥇 Jordan: $0');
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
    [
      'a read that answered with nothing',
      () => vi.fn().mockResolvedValue(undefined),
    ],
    [
      'a read that answered with a malformed roster',
      () => vi.fn().mockResolvedValue([null]),
    ],
  ])(
    'degrades both EW sections on %s and still delivers the report',
    async (_name, createReader) => {
      const text = await readReportSummary({
        ...defaults,
        repository: {
          listActivities: vi.fn().mockResolvedValue([activity('1')]),
        },
        meetingRepository: {
          listMeetingBookings: vi.fn().mockResolvedValue([booking('booking-1')]),
        },
        wholesalerRoleReader: { findRolesByIds: createReader() },
      });

      expect(text).toContain('🎉 Daily outreach report — 5am to 5am');
      expect(text).toContain('📊 Total activities: 1');
      expect(text).toContain('📅 Meetings set: 1');
      expect(text).toContain('🏆 Activity leaderboard (calls/emails/linkedin)');
      expect(text).toContain('🥇 Jordan: (1/0/0) · 1 meeting set');
      expect(text).toContain(
        'Wholesaler roles could not be read for this report, so meetings taken by EW are unavailable.',
      );
      expect(text).toContain(
        'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
      );
      // Never leak why: this text is delivered to a Telegram group.
      expect(text).not.toMatch(/denied|permitted|Error/);
    },
  );

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
});
