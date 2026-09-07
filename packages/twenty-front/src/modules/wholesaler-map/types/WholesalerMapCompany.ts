import { type Company } from '@/companies/types/Company';

export type WholesalerMapOwner = {
  __typename?: 'Wholesaler';
  id: string;
  name: string;
};

export type WholesalerMapCompany = Company & {
  historicalOwner?: WholesalerMapOwner | null;
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
