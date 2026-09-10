import { describe, expect, it } from 'vitest';

import {
  buildDailySummaries,
  formatDailySummary,
} from 'src/modules/outreach/services/daily-summary.service';

const activities = [
  {
    id: 'activity-1',
    wholesalerId: 'wholesaler-1',
    wholesalerName: 'Nash',
    companyName: 'Acme',
    activityType: 'Call',
    outcome: 'Connected',
    occurredAt: '2026-09-09T14:00:00.000Z',
  },
  {
    id: 'activity-2',
    wholesalerId: 'wholesaler-1',
    wholesalerName: 'Nash',
    companyName: 'Beacon',
    activityType: 'Email',
    outcome: 'Sent',
    occurredAt: '2026-09-09T16:00:00.000Z',
  },
  {
    id: 'activity-3',
    wholesalerId: 'wholesaler-2',
    wholesalerName: 'Sam',
    companyName: 'Cedar',
    activityType: 'Call',
    outcome: 'Voicemail',
    occurredAt: '2026-09-09T18:00:00.000Z',
  },
];

describe('buildDailySummaries', () => {
  it('groups the day by person with stable activity and outcome counts', () => {
    expect(buildDailySummaries(activities, '2026-09-09')).toEqual([
      {
        wholesalerId: 'wholesaler-1',
        wholesalerName: 'Nash',
        localDate: '2026-09-09',
        total: 2,
        activityCounts: [
          { label: 'Call', count: 1 },
          { label: 'Email', count: 1 },
        ],
        outcomeCounts: [
          { label: 'Connected', count: 1 },
          { label: 'Sent', count: 1 },
        ],
        activities: activities.slice(0, 2),
      },
      {
        wholesalerId: 'wholesaler-2',
        wholesalerName: 'Sam',
        localDate: '2026-09-09',
        total: 1,
        activityCounts: [{ label: 'Call', count: 1 }],
        outcomeCounts: [{ label: 'Voicemail', count: 1 }],
        activities: activities.slice(2),
      },
    ]);
  });
});

describe('formatDailySummary', () => {
  it('renders the same friendly taxonomy labels as the workspace reports', () => {
    const [summary] = buildDailySummaries(
      [
        {
          id: 'activity-1',
          wholesalerId: 'wholesaler-1',
          wholesalerName: 'Nash',
          companyName: 'Acme',
          contactName: 'Jamie',
          activityType: 'phone_call',
          outcome: 'follow_up_scheduled',
          occurredAt: '2026-09-09T14:00:00.000Z',
        },
      ],
      '2026-09-09',
    );

    expect(formatDailySummary(summary!)).toBe(
      [
        'Nash — 2026-09-09',
        'Total: 1',
        'By activity: Phone call: 1',
        'By outcome: Follow-up scheduled: 1',
        '• Phone call — Acme / Jamie — Follow-up scheduled',
      ].join('\n'),
    );
  });

  it('falls back to the raw value for a legacy or unrecognized taxonomy entry', () => {
    const [summary] = buildDailySummaries(
      [
        {
          id: 'activity-1',
          wholesalerId: 'wholesaler-1',
          wholesalerName: 'Nash',
          companyName: 'Acme',
          activityType: 'fax',
          outcome: 'unknown_outcome',
          occurredAt: '2026-09-09T14:00:00.000Z',
        },
      ],
      '2026-09-09',
    );

    expect(formatDailySummary(summary!)).toContain('By activity: fax: 1');
    expect(formatDailySummary(summary!)).toContain(
      'By outcome: unknown_outcome: 1',
    );
    expect(formatDailySummary(summary!)).toContain(
      '• fax — Acme — unknown_outcome',
    );
  });
});
