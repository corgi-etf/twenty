import { normalizeWholesalerMapCompanies } from '@/wholesaler-map/utils/normalizeWholesalerMapCompanies';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

const createCompany = (
  overrides: Partial<WholesalerMapCompany> = {},
): WholesalerMapCompany => ({
  __typename: 'Company',
  id: 'company-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Northstar Capital',
  domainName: {
    primaryLinkUrl: '',
    primaryLinkLabel: '',
    secondaryLinks: [],
  },
  address: {
    addressStreet1: '',
    addressStreet2: '',
    addressCity: 'Chicago',
    addressState: 'IL',
    addressPostcode: '',
    addressCountry: 'US',
    addressLat: 41.8781,
    addressLng: -87.6298,
  },
  linkedinLink: {
    primaryLinkUrl: 'https://www.linkedin.com/company/northstar',
    primaryLinkLabel: 'Northstar on LinkedIn',
  },
  description: 'Regional advisor prospect',
  firmPhone: '312-555-0199',
  historicalOwner: {
    id: 'owner-1',
    name: 'Alex Morgan',
    territory: 'Chicago',
  },
  leadStatus: 'Follow-up',
  websiteNotes: 'Prefers morning calls',
  ...overrides,
});

describe('normalizeWholesalerMapCompanies', () => {
  it('builds valid GeoJSON points with CRM detail properties', () => {
    expect(
      normalizeWholesalerMapCompanies(
        [createCompany()],
        { country: null, ownerId: null, postcode: null, state: null },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-87.6298, 41.8781],
          },
          properties: expect.objectContaining({
            companyId: 'company-1',
            companyName: 'Northstar Capital',
            firmPhone: '312-555-0199',
            fullAddress: 'Chicago, IL, US',
            leadStatus: 'Follow-up',
            linkedinUrl: 'https://www.linkedin.com/company/northstar',
            locationLabel: 'Chicago, IL, US',
            notes: 'Prefers morning calls',
            ownerId: 'owner-1',
            ownerName: 'Alex Morgan',
            ownerTerritory: 'Chicago',
            postcode: '',
            state: 'IL',
          }),
        }),
      ],
    });
  });

  it('uses safe detail fallbacks and never emits an executable LinkedIn URL', () => {
    const company = createCompany({
      description: 'Fallback company note',
      websiteNotes: ' ',
      linkedinLink: {
        primaryLinkUrl: ['java', 'script:alert(1)'].join(''),
        primaryLinkLabel: 'Unsafe',
      },
      address: {
        ...createCompany().address,
        addressStreet1: '100 W Lake St',
        addressPostcode: '60601',
      },
    });

    const [feature] = normalizeWholesalerMapCompanies(
      [company],
      { country: null, ownerId: null, postcode: null, state: null },
      'Unassigned',
      ['blue'],
      'gray',
    ).features;

    expect(feature?.properties).toEqual(
      expect.objectContaining({
        fullAddress: '100 W Lake St, Chicago, IL 60601, US',
        linkedinUrl: '',
        notes: 'Fallback company note',
        postcode: '60601',
      }),
    );
  });

  it.each([
    { addressLat: null, addressLng: -87.6298 },
    { addressLat: 41.8781, addressLng: null },
    { addressLat: Number.NaN, addressLng: -87.6298 },
    { addressLat: 91, addressLng: -87.6298 },
    { addressLat: 41.8781, addressLng: -181 },
  ])('rejects invalid coordinates %#', ({ addressLat, addressLng }) => {
    const company = createCompany({
      address: {
        ...createCompany().address,
        addressLat,
        addressLng,
      },
    });

    expect(
      normalizeWholesalerMapCompanies(
        [company],
        { country: null, ownerId: null, postcode: null, state: null },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features,
    ).toEqual([]);
  });

  it('filters points by historical owner and retains unassigned companies', () => {
    const unassigned = createCompany({
      id: 'company-2',
      name: 'Unassigned Lead',
      historicalOwner: null,
    });

    expect(
      normalizeWholesalerMapCompanies(
        [createCompany(), unassigned],
        {
          country: null,
          ownerId: 'owner-1',
          postcode: null,
          state: null,
        },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-1']);

    expect(
      normalizeWholesalerMapCompanies(
        [createCompany(), unassigned],
        { country: null, ownerId: '', postcode: null, state: null },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-2']);
  });

  it('filters mapped companies by combined state, ZIP, country, and owner', () => {
    const matchingCompany = createCompany({
      address: {
        ...createCompany().address,
        addressPostcode: '60601-1234',
      },
    });
    const wrongOwner = createCompany({
      id: 'company-2',
      historicalOwner: { id: 'owner-2', name: 'Zoe Kim' },
      address: {
        ...createCompany().address,
        addressPostcode: '60601-1234',
      },
    });
    const wrongState = createCompany({
      id: 'company-3',
      address: {
        ...createCompany().address,
        addressState: 'WI',
        addressPostcode: '53703',
      },
    });

    const result = normalizeWholesalerMapCompanies(
      [matchingCompany, wrongOwner, wrongState],
      {
        country: ' us ',
        ownerId: 'owner-1',
        postcode: ' 60601-1234 ',
        state: 'il',
      },
      'Unassigned',
      ['blue', 'red'],
      'gray',
    );

    expect(
      result.features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-1']);
    expect(result.features[0]?.properties.locationLabel).toBe(
      'Chicago, IL 60601-1234, US',
    );
  });

  it('matches unassigned ownership together with location filters', () => {
    const unassigned = createCompany({
      id: 'company-2',
      historicalOwner: null,
      address: {
        ...createCompany().address,
        addressPostcode: '60601',
      },
    });

    expect(
      normalizeWholesalerMapCompanies(
        [createCompany(), unassigned],
        {
          country: 'US',
          ownerId: '',
          postcode: '60601',
          state: 'IL',
        },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-2']);
  });

  it('formats a mapped company when individual address fields are null or undefined', () => {
    const company = createCompany({
      address: {
        addressCity: null,
        addressState: undefined,
        addressPostcode: null,
        addressCountry: 'US',
        addressLat: 41.8781,
        addressLng: -87.6298,
      },
    });

    const result = normalizeWholesalerMapCompanies(
      [company],
      { country: 'US', ownerId: null, postcode: null, state: null },
      'Unassigned',
      ['blue', 'red'],
      'gray',
    );

    expect(result.features[0]?.properties.locationLabel).toBe('US');
  });

  it('formats an empty location when every address label subfield is nullish', () => {
    const company = createCompany({
      address: {
        addressCity: undefined,
        addressState: null,
        addressPostcode: undefined,
        addressCountry: null,
        addressLat: 41.8781,
        addressLng: -87.6298,
      },
    });

    expect(
      normalizeWholesalerMapCompanies(
        [company],
        { country: null, ownerId: null, postcode: null, state: null },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features[0]?.properties.locationLabel,
    ).toBe('');
  });

  it.each([{ address: null }, { address: undefined }, { address: {} }])(
    'ignores a company with a null or partial address %#',
    ({ address }) => {
      expect(
        normalizeWholesalerMapCompanies(
          [createCompany({ address })],
          { country: null, ownerId: null, postcode: null, state: null },
          'Unassigned',
          ['blue', 'red'],
          'gray',
        ).features,
      ).toEqual([]);
    },
  );

  it('does not match a location filter against a missing address subfield', () => {
    const company = createCompany({
      address: {
        addressState: null,
        addressPostcode: undefined,
        addressCountry: 'US',
        addressLat: 41.8781,
        addressLng: -87.6298,
      },
    });

    expect(
      normalizeWholesalerMapCompanies(
        [company],
        { country: 'US', ownerId: null, postcode: null, state: 'IL' },
        'Unassigned',
        ['blue', 'red'],
        'gray',
      ).features,
    ).toEqual([]);
  });
});
