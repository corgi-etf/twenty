import { describe, expect, it } from 'vitest';

import {
  buildDailySummaries,
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
