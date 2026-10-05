import {
  formatCorgiMoney,
  getCorgiFollowUpTiming,
  getCorgiDateRange,
  getCorgiRecordPath,
} from '@/corgi-crm/utils/corgiHomePresentation';

describe('CRM Home presentation', () => {
  it('distinguishes overdue, due-today and future work using the reporting day', () => {
    const now = new Date('2026-10-06T04:30:00Z');
    expect(getCorgiFollowUpTiming('2026-10-05T04:00:00Z', now)).toBe('overdue');
    expect(getCorgiFollowUpTiming('2026-10-05T18:00:00Z', now)).toBe(
      'due-today',
    );
    expect(getCorgiFollowUpTiming('2027-01-01T18:00:00Z', now)).toBe(
      'upcoming',
    );
  });
  it('uses Chicago calendar days before local midnight and over the spring DST boundary', () => {
    expect(getCorgiDateRange(7, new Date('2026-03-09T04:30:00Z'))).toEqual({
      from: '2026-03-02',
      to: '2026-03-08',
    });
    expect(getCorgiDateRange(7, new Date('2026-11-02T05:30:00Z'))).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
  });

  it('preserves currencies instead of creating a mixed monetary total', () => {
    expect(
      formatCorgiMoney([
        { currencyCode: 'USD', amountMicros: '125500000' },
        { currencyCode: 'EUR', amountMicros: '50000000' },
      ]),
    ).toBe('$125.50 · €50.00');
  });

  it('rounds int64 micros exactly at the currency precision without converting the amount to Number', () => {
    expect(
      formatCorgiMoney([
        { currencyCode: 'USD', amountMicros: '9223372036854774999' },
      ]),
    ).toBe('$9,223,372,036,854.77');
    expect(
      formatCorgiMoney([
        { currencyCode: 'USD', amountMicros: '9223372036854775000' },
      ]),
    ).toBe('$9,223,372,036,854.78');
    expect(
      formatCorgiMoney([{ currencyCode: 'USD', amountMicros: '-500000' }]),
    ).toBe('-$0.50');
    expect(
      formatCorgiMoney([
        { currencyCode: 'JPY', amountMicros: '1500000' },
        { currencyCode: 'KWD', amountMicros: '1234567' },
      ]),
    ).toBe('¥2 · KWD\u00a01.235');
  });

  it('creates full record deep links with encoded path components', () => {
    expect(
      getCorgiRecordPath({
        id: 'record/id',
        objectNameSingular: 'company',
        objectNamePlural: 'companies',
        label: 'A company',
      }),
    ).toBe('/object/company/record%2Fid');
  });
});
