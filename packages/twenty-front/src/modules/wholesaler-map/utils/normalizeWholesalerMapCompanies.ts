import {
  type WholesalerMapCompany,
  type WholesalerMapFeature,
  type WholesalerMapFeatureCollection,
} from '@/wholesaler-map/types/WholesalerMapCompany';

const isValidLatitude = (value: number | null): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -90 &&
  value <= 90;

const isValidLongitude = (value: number | null): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -180 &&
  value <= 180;

const getOwnerColor = (
  ownerId: string,
  ownerColors: readonly string[],
  unassignedOwnerColor: string,
) => {
  if (ownerId === '') {
    return unassignedOwnerColor;
  }

  const ownerHash = [...ownerId].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return ownerColors[ownerHash % ownerColors.length] ?? unassignedOwnerColor;
};

const getLocationLabel = (company: WholesalerMapCompany) =>
  [
    company.address.addressCity,
    company.address.addressState,
    company.address.addressCountry,
  ]
    .filter(
      (value, index, values) => value !== '' && values.indexOf(value) === index,
    )
    .join(', ');

const toWholesalerMapFeature = (
  company: WholesalerMapCompany,
  unassignedOwnerName: string,
  ownerColors: readonly string[],
  unassignedOwnerColor: string,
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
      ownerName: company.historicalOwner?.name ?? unassignedOwnerName,
      ownerColor: getOwnerColor(ownerId, ownerColors, unassignedOwnerColor),
    },
  };
};

export const normalizeWholesalerMapCompanies = (
  companies: WholesalerMapCompany[],
  selectedOwnerId: string | null,
  unassignedOwnerName: string,
  ownerColors: readonly string[],
  unassignedOwnerColor: string,
): WholesalerMapFeatureCollection => {
  const features = companies.flatMap((company) => {
    const ownerId = company.historicalOwner?.id ?? '';

    if (selectedOwnerId !== null && ownerId !== selectedOwnerId) {
      return [];
    }

    const feature = toWholesalerMapFeature(
      company,
      unassignedOwnerName,
      ownerColors,
      unassignedOwnerColor,
    );

    return feature === null ? [] : [feature];
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};
