import { consumeCorgiWins } from '@/corgi-crm/events/utils/consumeCorgiWins';
import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';

const win = (id: string): CorgiWin => ({
  id,
  kind: 'meeting-booked',
  record: {
    id,
    objectNameSingular: 'meetingBooking',
    objectNamePlural: 'meetingBookings',
    label: 'Meeting',
  },
  actorName: 'A colleague',
  actorWorkspaceMemberId: 'member',
  recordedAt: '2026-10-05T16:00:00Z',
  effectiveAt: '2026-10-06T16:00:00Z',
  isCreation: true,
});

describe('CRM live notification replay protection', () => {
  it('does not announce historical records first discovered after the initial fetch', () => {
    expect(
      consumeCorgiWins({
        wins: [win('backfill')],
        seenIds: [],
        initialized: true,
        startedAt: '2026-10-06T15:00:00Z',
      }).freshWins,
    ).toEqual([]);
  });
  it('seeds history silently on first load', () => {
    expect(
      consumeCorgiWins({ wins: [win('old')], seenIds: [], initialized: false }),
    ).toEqual({ freshWins: [], seenIds: ['old'] });
  });
  it('announces each new event once despite duplicate deliveries and reconnects', () => {
    const consumed = consumeCorgiWins({
      wins: [win('new'), win('new'), win('old')],
      seenIds: ['old'],
      initialized: true,
    });
    expect(consumed.freshWins.map((event) => event.id)).toEqual(['new']);
    expect(
      consumeCorgiWins({
        wins: [win('new'), win('old')],
        seenIds: consumed.seenIds,
        initialized: true,
      }).freshWins,
    ).toEqual([]);
  });
  it('bounds stored identifiers without persisting sensitive record content', () => {
    const consumed = consumeCorgiWins({
      wins: [win('latest')],
      seenIds: Array.from({ length: 500 }, (_, index) => String(index)),
      initialized: true,
    });
    expect(consumed.seenIds).toHaveLength(500);
    expect(consumed.seenIds.at(-1)).toBe('latest');
  });
});
