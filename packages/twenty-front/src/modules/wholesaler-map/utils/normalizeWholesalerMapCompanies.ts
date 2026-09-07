import {
  type WholesalerMapCompany,
  type WholesalerMapFeature,
  type WholesalerMapFeatureCollection,
} from '@/wholesaler-map/types/WholesalerMapCompany';

const OWNER_COLORS = [
  '#1965B0',
  '#DC050C',
  '#F7A35C',
  '#4EB265',
  '#7BAFDE',
  '#882E72',
  '#F4A736',
  '#9A6324',
] as const;

const UNASSIGNED_OWNER_COLOR = '#6B7280';

const isValidLatitude = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;

const isValidLongitude = (value: number | null) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -180 &&
  value <= 180;

const getOwnerColor = (ownerId: string) => {
  if (ownerId === '') {
    return UNASSIGNED_OWNER_COLOR;
  }

  const ownerHash = [...ownerId].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return OWNER_COLORS[ownerHash % OWNER_COLORS.length];
};

const getLocationLabel = (company: WholesalerMapCompany) =>
  [
    company.address.addressCity,
    company.address.addressState,
    company.address.addressCountry,
  ]
    .filter((value, index, values) => value !== '' && values.indexOf(value) === index)
    .join(', ');

const toWholesalerMapFeature = (
  company: WholesalerMapCompany,
): WholesalerMapFeature | null => {
  const latitude = company.address.addressLat;
  const longitude = company.address.addressLng;

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  const ownerId = company.historicalOwner?.id ?? '';

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
    properties: {
      companyId: company.id,
      companyName: company.name,
      locationLabel: getLocationLabel(company),
      ownerId,
      ownerName: company.historicalOwner?.name ?? 'Unassigned',
      ownerColor: getOwnerColor(ownerId),
    },
  };
};

export const normalizeWholesalerMapCompanies = (
  companies: WholesalerMapCompany[],
  selectedOwnerId: string | null,
): WholesalerMapFeatureCollection => {
  const features = companies.flatMap((company) => {
    const ownerId = company.historicalOwner?.id ?? '';

    if (selectedOwnerId !== null && ownerId !== selectedOwnerId) {
      return [];
    }

    const feature = toWholesalerMapFeature(company);

    return feature === null ? [] : [feature];
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};
