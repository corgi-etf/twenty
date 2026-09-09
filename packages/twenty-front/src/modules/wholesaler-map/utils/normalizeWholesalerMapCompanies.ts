import {
  type WholesalerMapCompany,
  type WholesalerMapFeature,
  type WholesalerMapFeatureCollection,
  type WholesalerMapFilters,
} from '@/wholesaler-map/types/WholesalerMapCompany';
import { normalizeWholesalerMapFilterValue } from '@/wholesaler-map/utils/normalizeWholesalerMapFilterValue';

const isValidLatitude = (value: number | null | undefined): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= -90 &&
  value <= 90;

const isValidLongitude = (value: number | null | undefined): value is number =>
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

const getLocationLabel = (company: WholesalerMapCompany) => {
  const city = company.address?.addressCity?.trim() ?? '';
  const stateAndPostcode = [
    company.address?.addressState?.trim() ?? '',
    company.address?.addressPostcode?.trim() ?? '',
  ]
    .filter((value) => value !== '')
    .join(' ');
  const country = company.address?.addressCountry?.trim() ?? '';

  return [city, stateAndPostcode, country]
    .filter(
      (value, index, values) => value !== '' && values.indexOf(value) === index,
    )
    .join(', ');
};

const getFullAddress = (company: WholesalerMapCompany) =>
  [
    company.address?.addressStreet1?.trim(),
    company.address?.addressStreet2?.trim(),
    company.address?.addressCity?.trim(),
    [
      company.address?.addressState?.trim(),
      company.address?.addressPostcode?.trim(),
    ]
      .filter(Boolean)
      .join(' '),
    company.address?.addressCountry?.trim(),
  ]
    .filter(Boolean)
    .join(', ');

const getLinkedinUrl = (company: WholesalerMapCompany) => {
  const url = company.linkedinLink?.primaryLinkUrl?.trim() ?? '';

  return /^https?:\/\//i.test(url) ? url : '';
};

const matchesLocationFilter = (
  fieldValue: string | null | undefined,
  selectedValue: string | null,
) =>
  selectedValue === null ||
  normalizeWholesalerMapFilterValue(fieldValue) ===
    normalizeWholesalerMapFilterValue(selectedValue);

const matchesFilters = (
  company: WholesalerMapCompany,
  filters: WholesalerMapFilters,
) => {
  const ownerId = company.historicalOwner?.id ?? '';

  return (
    (filters.ownerId === null || ownerId === filters.ownerId) &&
    matchesLocationFilter(company.address?.addressState, filters.state) &&
    matchesLocationFilter(company.address?.addressPostcode, filters.postcode) &&
    matchesLocationFilter(company.address?.addressCountry, filters.country)
  );
};

const toWholesalerMapFeature = (
  company: WholesalerMapCompany,
  unassignedOwnerName: string,
  ownerColors: readonly string[],
  unassignedOwnerColor: string,
): WholesalerMapFeature | null => {
  const latitude = company.address?.addressLat;
  const longitude = company.address?.addressLng;

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
      firmPhone: company.firmPhone?.trim() ?? '',
      fullAddress: getFullAddress(company),
      leadStatus: company.leadStatus?.trim() ?? '',
      linkedinUrl: getLinkedinUrl(company),
      locationLabel: getLocationLabel(company),
      notes: company.websiteNotes?.trim() || company.description?.trim() || '',
      ownerId,
      ownerName: company.historicalOwner?.name ?? unassignedOwnerName,
      ownerTerritory: company.historicalOwner?.territory?.trim() ?? '',
      ownerColor: getOwnerColor(ownerId, ownerColors, unassignedOwnerColor),
      postcode: company.address?.addressPostcode?.trim() ?? '',
      state: company.address?.addressState?.trim() ?? '',
    },
  };
};

export const normalizeWholesalerMapCompanies = (
  companies: WholesalerMapCompany[],
  filters: WholesalerMapFilters,
  unassignedOwnerName: string,
  ownerColors: readonly string[],
  unassignedOwnerColor: string,
): WholesalerMapFeatureCollection => {
  const features = companies.flatMap((company) => {
    if (!matchesFilters(company, filters)) {
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
