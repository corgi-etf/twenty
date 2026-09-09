import { type Company } from '@/companies/types/Company';

export type WholesalerMapOwner = {
  __typename?: 'Wholesaler';
  id: string;
  name: string;
};

export type WholesalerMapAddress = {
  __typename?: 'Address';
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
  addressLat?: number | null;
  addressLng?: number | null;
};

export type WholesalerMapCompany = Omit<Company, 'address'> & {
  address?: WholesalerMapAddress | null;
  historicalOwner?: WholesalerMapOwner | null;
};

export type WholesalerMapFilters = {
  country: string | null;
  ownerId: string | null;
  postcode: string | null;
  state: string | null;
};

export type WholesalerMapFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    companyId: string;
    companyName: string;
    locationLabel: string;
    ownerId: string;
    ownerName: string;
    ownerColor: string;
  };
};

export type WholesalerMapFeatureCollection = {
  type: 'FeatureCollection';
  features: WholesalerMapFeature[];
};
