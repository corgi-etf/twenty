import { useEffect } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  WHOLESALER_MAP_DATA_CONTRACT,
  WHOLESALER_MAP_PAGE_SIZE,
} from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { useWholesalerMapAccess } from '@/wholesaler-map/hooks/useWholesalerMapAccess';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

export const useWholesalerMapCompanies = () => {
  const access = useWholesalerMapAccess();
  const query = useFindManyRecords<WholesalerMapCompany>({
    objectNameSingular:
      WHOLESALER_MAP_DATA_CONTRACT.companyObjectNameSingular,
    recordGqlFields: access.recordGqlFields,
    limit: WHOLESALER_MAP_PAGE_SIZE,
    skip: !access.canViewMap,
  });

  useEffect(() => {
    if (access.canViewMap && !query.loading && query.hasNextPage) {
      void query.fetchMoreRecords();
    }
  }, [
    access.canViewMap,
    query.fetchMoreRecords,
    query.hasNextPage,
    query.loading,
    query.records.length,
  ]);

  return {
    ...query,
    ...access,
    isLoadingAllCompanies: query.loading || query.hasNextPage,
  };
};
