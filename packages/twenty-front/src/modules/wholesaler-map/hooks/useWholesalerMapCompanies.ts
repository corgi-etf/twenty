import { useEffect } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { useWholesalerMapAccess } from '@/wholesaler-map/hooks/useWholesalerMapAccess';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

export const useWholesalerMapCompanies = () => {
  const access = useWholesalerMapAccess();
  const query = useFindManyRecords<WholesalerMapCompany>({
    objectNameSingular: WHOLESALER_MAP_DATA_CONTRACT.companyObjectNameSingular,
    recordGqlFields: access.recordGqlFields,
    limit: WHOLESALER_MAP_DATA_CONTRACT.pageSize,
    skip: !access.canViewMap,
  });

  const { fetchMoreRecords, hasNextPage, loading } = query;

  useEffect(() => {
    if (access.canViewMap && !loading && hasNextPage) {
      void fetchMoreRecords();
    }
  }, [access.canViewMap, fetchMoreRecords, hasNextPage, loading]);

  return {
    ...query,
    ...access,
    isLoadingAllCompanies: query.loading || query.hasNextPage,
  };
};
