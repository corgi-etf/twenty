import { getCorgiCompanyTypePresentation } from '../getCorgiCompanyTypePresentation';

describe('company type presentation', () => {
  it.each([
    [' RIA ', 'ria', 'RIA', 'blue'],
    ['REGISTERED INVESTMENT ADVISOR', 'ria', 'RIA', 'blue'],
    ['Broker–Dealer', 'brokerDealer', 'Broker-dealer', 'purple'],
    ['broker/dealer', 'brokerDealer', 'Broker-dealer', 'purple'],
    ['BANK', 'bank', 'Bank', 'orange'],
    ['family_office', 'familyOffice', 'Family office', 'turquoise'],
    ['AssetManager', 'assetManager', 'Asset manager', 'pink'],
    ['institutional investor', 'institution', 'Institution', 'yellow'],
  ])(
    'recognizes only documented aliases: %s',
    (rawValue, category, label, color) => {
      expect(getCorgiCompanyTypePresentation(rawValue)).toEqual({
        rawValue,
        category,
        label,
        color,
        isMapped: true,
      });
    },
  );
  it('keeps an unknown value unchanged without substring guessing', () => {
    const rawValue = '  Bank / RIA hybrid  ';
    expect(getCorgiCompanyTypePresentation(rawValue)).toEqual({
      rawValue,
      category: 'unmapped',
      label: rawValue,
      color: 'gray',
      isMapped: false,
    });
  });
  it.each([undefined, null, '', '  '])(
    'does not manufacture a type for an empty value',
    (value) => {
      expect(getCorgiCompanyTypePresentation(value)).toBeUndefined();
    },
  );
});
