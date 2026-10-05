import {
  type CorgiHomeSummary,
  type CorgiPage,
} from '@/corgi-crm/types/CorgiHome';

const emptyPage = <TRecord>(): CorgiPage<TRecord> => ({
  status: 'available',
  records: [],
  totalCount: 0,
  nextCursor: null,
});
export const corgiHomeFixture = (): CorgiHomeSummary => ({
  enabled: true,
  timeZone: 'America/Chicago',
  generatedAt: '2026-10-05T15:00:00Z',
  today: {
    date: '2026-10-05',
    metrics: {
      activities: { status: 'available', count: 124 },
      meetingsSet: { status: 'available', count: 3 },
      meetingsTaken: { status: 'available', count: 1 },
      allocations: {
        status: 'available',
        count: 2,
        amounts: [
          { currencyCode: 'USD', amountMicros: '2500000000' },
          { currencyCode: 'EUR', amountMicros: '1000000000' },
        ],
      },
      currentClients: { status: 'available', count: 27 },
    },
  },
  latestRecords: emptyPage(),
  followUps: emptyPage(),
  agenda: emptyPage(),
  team: emptyPage(),
  recentAllocations: emptyPage(),
  activeClients: emptyPage(),
  liveWins: emptyPage(),
});
