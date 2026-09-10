import { describe, expect, it } from 'vitest';

import { DEFAULT_WHOLESALER_ROLE } from 'src/constants';
import { isBusinessDevelopmentRepresentativeRole } from 'src/modules/wholesaler/wholesaler-role';

describe('isBusinessDevelopmentRepresentativeRole', () => {
  it.each([['BDR'], ['bdr'], ['Bdr'], ['  BDR  '], ['\tbdr\n']])(
    'identifies %j however it was typed',
    (role) => {
      expect(isBusinessDevelopmentRepresentativeRole(role)).toBe(true);
    },
  );

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    [DEFAULT_WHOLESALER_ROLE],
    ['wholesaler'],
    ['EW'],
    ['external wholesaler'],
    ['Sales'],
    ['BDR Manager'],
    ['Senior BDR'],
    ['B D R'],
  ])('leaves %j unidentified', (role) => {
    expect(isBusinessDevelopmentRepresentativeRole(role)).toBe(false);
  });
});
