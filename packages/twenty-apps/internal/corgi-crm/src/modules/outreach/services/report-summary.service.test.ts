import { describe, expect, it, vi } from 'vitest';

import {
  buildReportSummary,
  formatReportSummary,
  getReportWindow,
  readReportSummary,
} from 'src/modules/outreach/services/report-summary.service';
import { type OutreachActivity } from 'src/modules/outreach/types';

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
    ]);
    expect(summary.meetingLeaderboard).toEqual([
      { ownerId: 'owner-booker', name: 'Casey', count: 1 },
      { ownerId: 'owner-jordan', name: 'Jordan', count: 1 },
    ]);
  });

  it('totals all owners once, breaks down types/outcomes, and ranks by count then name then ID', () => {
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
    expect(summary.activityCounts).toEqual([
      { label: 'email', count: 1 },
      { label: 'meeting', count: 1 },
      { label: 'phone_call', count: 3 },
      { label: 'Unspecified', count: 1 },
    ]);
    expect(summary.outcomeCounts).toEqual([
      { label: 'connected', count: 3 },
      { label: 'follow_up_scheduled', count: 1 },
      { label: 'not_interested', count: 1 },
      { label: 'Unspecified', count: 1 },
    ]);
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

  it('renders celebratory medals, truthful totals, readable taxonomy and separate booking rankings', () => {
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
    expect(text).toContain('By activity: Phone call: 1');
    expect(text).toContain('By outcome: Connected: 1');
    expect(text).toContain('🏆 Activity leaderboard');
    expect(text).toContain('🥇 Jordan: 1 activity · 1 meeting set');
    expect(text).toContain('🤝 Meeting-booking leaderboard\n🥇 Jordan: 1 meeting set');
    expect(text).not.toMatch(/[🥇🥈🥉] [123]\./u);
    expect(text).toContain('Meetings counted when booked, not when scheduled.');
    expect(text).not.toMatch(/ARR|revenue|Private/);
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
    expect(summary.meetingLeaderboard).toEqual([
      { ownerId: 'owner-taylor', name: 'Taylor', count: 2 },
      { ownerId: 'owner-alex-1', name: 'Alex', count: 1 },
      { ownerId: 'owner-alex-2', name: 'Alex', count: 1 },
      { ownerId: 'unassigned', name: 'Unassigned', count: 1 },
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

  it('renders a useful empty report with zero and both breakdowns', () => {
    const text = formatReportSummary(
      buildReportSummary({ ...defaults, activities: [] }),
    );
    expect(text).toContain('Daily outreach report — last 24 hours');
    expect(text).toContain('America/Chicago');
    expect(text).toContain('Total activities: 0');
    expect(text).toContain('Meetings set: 0');
    expect(text).toContain('By activity: None');
    expect(text).toContain('By outcome: None');
    expect(text).toContain('No outreach logged in this period.');
    expect(text).toContain('No meetings booked in this period.');
  });

  it('keeps owner and category labels on single lines in plain Telegram text', () => {
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
    expect(summary.activityCounts).toEqual([{ label: 'phone_call', count: 1 }]);
  });
});
