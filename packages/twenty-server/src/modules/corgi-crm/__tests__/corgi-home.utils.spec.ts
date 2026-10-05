import { BadRequestException } from '@nestjs/common';

import {
  corgiDayRange,
  corgiPageCursor,
  parseCorgiHomeQuery,
  readCorgiOffset,
  sumCorgiMoney,
} from 'src/modules/corgi-crm/corgi-home.utils';

describe('CRM calendar and pagination conventions', () => {
  it('uses Chicago midnight, including the 23-hour spring day', () => {
    expect(corgiDayRange('2026-03-08')).toEqual({
      date: '2026-03-08',
      start: '2026-03-08T06:00:00.000Z',
      end: '2026-03-09T05:00:00.000Z',
    });
    expect(corgiDayRange('2026-11-01').end).toBe('2026-11-02T06:00:00.000Z');
  });

  it('rejects malformed dates, arbitrary sections and cross-query cursors', () => {
    expect(() => parseCorgiHomeQuery({ section: 'passwords' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCorgiHomeQuery({ from: '2026-02-30' })).toThrow(
      BadRequestException,
    );
    const query = parseCorgiHomeQuery({
      section: 'currentClients',
      search: 'Acme',
    });
    const cursor = corgiPageCursor(25, query);
    expect(readCorgiOffset({ ...query, cursor })).toBe(25);
    expect(() =>
      readCorgiOffset({ ...query, search: 'Other', cursor }),
    ).toThrow(BadRequestException);
  });

  it('does not round large micros or combine different currencies', () => {
    expect(
      sumCorgiMoney([
        { currencyCode: 'USD', amountMicros: '9007199254740993' },
        { currencyCode: 'USD', amountMicros: '2' },
        { currencyCode: 'EUR', amountMicros: '5000000' },
      ]),
    ).toEqual([
      { currencyCode: 'EUR', amountMicros: '5000000' },
      { currencyCode: 'USD', amountMicros: '9007199254740995' },
    ]);
  });
});
