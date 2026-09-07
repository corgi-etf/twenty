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
    primaryLinkUrl: '',
    primaryLinkLabel: '',
  },
  historicalOwner: {
    id: 'owner-1',
    name: 'Alex Morgan',
  },
  ...overrides,
});

describe('normalizeWholesalerMapCompanies', () => {
  it('builds valid GeoJSON points with CRM detail properties', () => {
    expect(normalizeWholesalerMapCompanies([createCompany()], null)).toEqual({
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
            locationLabel: 'Chicago, IL, US',
            ownerId: 'owner-1',
            ownerName: 'Alex Morgan',
          }),
        }),
      ],
    });
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

    expect(normalizeWholesalerMapCompanies([company], null).features).toEqual(
      [],
    );
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
        'owner-1',
      ).features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-1']);

    expect(
      normalizeWholesalerMapCompanies(
        [createCompany(), unassigned],
        '',
      ).features.map(({ properties }) => properties.companyId),
    ).toEqual(['company-2']);
  });
});
