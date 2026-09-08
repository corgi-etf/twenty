import { useCallback, useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { useWholesalerMapAccess } from '@/wholesaler-map/hooks/useWholesalerMapAccess';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

export const useWholesalerMapCompanies = () => {
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const access = useWholesalerMapAccess();
  const query = useFindManyRecords<WholesalerMapCompany>({
    objectNameSingular: WHOLESALER_MAP_DATA_CONTRACT.companyObjectNameSingular,
    recordGqlFields: access.recordGqlFields,
    limit: WHOLESALER_MAP_DATA_CONTRACT.pageSize,
    skip: !access.canViewMap,
  });

  const {
    fetchMoreRecords,
    hasNextPage,
    loading,
    refetch: refetchRecords,
  } = query;

  useEffect(() => {
    if (
      !access.canViewMap ||
      loading ||
      !hasNextPage ||
      isFetchingNextPage ||
      paginationError !== null
    ) {
      return;
    }

    setIsFetchingNextPage(true);

    const fetchNextPage = async () => {
      try {
        const result = await fetchMoreRecords();

        if (isDefined(result?.error)) {
          setPaginationError(
            result.error instanceof Error
              ? result.error
              : new Error(result.error.message),
          );
        }
      } catch (error) {
        setPaginationError(
          error instanceof Error
            ? error
            : new Error('Lead location pagination failed'),
        );
      } finally {
        setIsFetchingNextPage(false);
      }
    };

    void fetchNextPage();
  }, [
    access.canViewMap,
    fetchMoreRecords,
    hasNextPage,
    isFetchingNextPage,
    loading,
    paginationError,
  ]);

  const refetch = useCallback(async () => {
    setPaginationError(null);

    return refetchRecords();
  }, [refetchRecords]);

  return {
    ...query,
    ...access,
    error: query.error ?? paginationError,
    refetch,
    isLoadingAllCompanies:
      query.loading ||
      (query.hasNextPage && paginationError === null) ||
      isFetchingNextPage,
  };
};
