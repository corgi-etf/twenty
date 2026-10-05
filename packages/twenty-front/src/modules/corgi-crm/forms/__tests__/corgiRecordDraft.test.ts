import {
  getCorgiCreateError,
  getCorgiRelationshipError,
} from '../utils/corgiRecordDraft';

describe('CRM drafts', () => {
  it('requires a real company name and meaningful allocation before save', () => {
    expect(getCorgiCreateError('company', { name: '  ' })).toBeDefined();
    expect(getCorgiCreateError('company', { name: 'Example' })).toBeUndefined();
    expect(
      getCorgiCreateError('companyAllocation', {
        ticker: 'FLEX',
        companyId: 'a',
        amount: { amountMicros: 0, currencyCode: 'USD' },
      }),
    ).toBeDefined();
    expect(
      getCorgiCreateError('companyAllocation', {
        ticker: 'FLEX',
        companyId: 'a',
        amount: { amountMicros: 1000000, currencyCode: 'CAD' },
      }),
    ).toBeUndefined();
  });
  it('rejects cross-company links but allows an unlinked contact without moving it', () => {
    expect(
      getCorgiRelationshipError('a', { company: { id: 'b' } }),
    ).toBeDefined();
    expect(
      getCorgiRelationshipError('a', { company: { id: 'a' } }),
    ).toBeUndefined();
    expect(getCorgiRelationshipError('a', {})).toBeUndefined();
  });
});

it('rejects a blank full-name person and a completed meeting without actual time', () => {
  expect(
    getCorgiCreateError('person', { name: { firstName: ' ', lastName: '' } }),
  ).toBeDefined();
  expect(
    getCorgiCreateError('meetingBooking', {
      companyId: 'a',
      wholesalerId: 'b',
      scheduledAt: '2026-10-05T12:00:00Z',
      status: 'COMPLETED',
    }),
  ).toBeDefined();
});
