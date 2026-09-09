import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';
import { getWholesalerMapLocationOptions } from '@/wholesaler-map/utils/getWholesalerMapLocationOptions';

const createCompany = (state: string, postcode: string, country: string) =>
  ({
    address: {
      addressState: state,
      addressPostcode: postcode,
      addressCountry: country,
    },
  }) as WholesalerMapCompany;

describe('getWholesalerMapLocationOptions', () => {
  it('deduplicates normalized values and sorts domestic territory values', () => {
    const options = getWholesalerMapLocationOptions([
      createCompany(' wi ', '53703', 'US'),
      createCompany('IL', '60602', 'ca'),
      createCompany('il', ' 60601 ', ' us '),
      createCompany('', '', ''),
    ]);

    expect(options.stateOptions).toEqual([
      { label: 'IL', value: 'IL' },
      { label: 'WI', value: 'WI' },
    ]);
    expect(options.postcodeOptions).toEqual([
      { label: '53703', value: '53703' },
      { label: '60601', value: '60601' },
      { label: '60602', value: '60602' },
    ]);
    expect(options.countryOptions).toEqual([
      { label: 'US', value: 'US' },
      { label: 'CA', value: 'CA' },
    ]);
  });
});
