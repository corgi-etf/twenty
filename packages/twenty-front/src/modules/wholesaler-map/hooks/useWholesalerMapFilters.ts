import { useCallback, useMemo, useState } from 'react';

import {
  type WholesalerMapCompany,
  type WholesalerMapFilters,
} from '@/wholesaler-map/types/WholesalerMapCompany';
import { getWholesalerMapLocationOptions } from '@/wholesaler-map/utils/getWholesalerMapLocationOptions';
import { getWholesalerMapOwnerOptions } from '@/wholesaler-map/utils/getWholesalerMapOwnerOptions';
import { normalizeWholesalerMapCompanies } from '@/wholesaler-map/utils/normalizeWholesalerMapCompanies';

const EMPTY_FILTERS: WholesalerMapFilters = {
  country: null,
  ownerId: null,
  postcode: null,
  state: null,
};

type UseWholesalerMapFiltersArgs = {
  companies: WholesalerMapCompany[];
  ownerColors: readonly string[];
  unassignedOwnerColor: string;
  unassignedOwnerName: string;
};

export const useWholesalerMapFilters = ({
  companies,
  ownerColors,
  unassignedOwnerColor,
  unassignedOwnerName,
}: UseWholesalerMapFiltersArgs) => {
  const [filters, setFilters] = useState<WholesalerMapFilters>(EMPTY_FILTERS);
  const locationOptions = useMemo(
    () => getWholesalerMapLocationOptions(companies),
    [companies],
  );
  const ownerOptions = useMemo(
    () => getWholesalerMapOwnerOptions(companies, unassignedOwnerName),
    [companies, unassignedOwnerName],
  );
  const featureCollection = useMemo(
    () =>
      normalizeWholesalerMapCompanies(
        companies,
        filters,
        unassignedOwnerName,
        ownerColors,
        unassignedOwnerColor,
      ),
    [
      companies,
      filters,
      ownerColors,
      unassignedOwnerColor,
      unassignedOwnerName,
    ],
  );
  const hasActiveFilters = Object.values(filters).some(
    (selectedValue) => selectedValue !== null,
  );

  const setSelectedCountry = useCallback((country: string | null) => {
    setFilters((currentFilters) => ({ ...currentFilters, country }));
  }, []);
  const setSelectedOwnerId = useCallback((ownerId: string | null) => {
    setFilters((currentFilters) => ({ ...currentFilters, ownerId }));
  }, []);
  const setSelectedPostcode = useCallback((postcode: string | null) => {
    setFilters((currentFilters) => ({ ...currentFilters, postcode }));
  }, []);
  const setSelectedState = useCallback((state: string | null) => {
    setFilters((currentFilters) => ({ ...currentFilters, state }));
  }, []);
  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  return {
    ...locationOptions,
    featureCollection,
    filters,
    hasActiveFilters,
    ownerOptions,
    resetFilters,
    setSelectedCountry,
    setSelectedOwnerId,
    setSelectedPostcode,
    setSelectedState,
  };
};
