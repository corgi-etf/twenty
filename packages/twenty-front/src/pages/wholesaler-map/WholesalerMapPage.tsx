import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useNavigate } from 'react-router-dom';
import { AppPath, CoreObjectNameSingular } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { IconMap } from 'twenty-ui/icon';

import { RecordIndexEmptyStateNotShared } from '@/object-record/record-index/components/RecordIndexEmptyStateNotShared';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { WholesalerMapContent } from '@/wholesaler-map/components/WholesalerMapContent';
import { WHOLESALER_COVERAGE_MAP_COLORS } from '@/wholesaler-map/constants/WholesalerCoverageMapColors';
import { useWholesalerMapCompanies } from '@/wholesaler-map/hooks/useWholesalerMapCompanies';
import { useWholesalerMapFilters } from '@/wholesaler-map/hooks/useWholesalerMapFilters';

const StyledPageHeading = styled.h1`
  color: inherit;
  font: inherit;
  margin: 0;
`;

export const WholesalerMapPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const {
    canViewMap,
    error,
    hasWholesalerRelation,
    isLoadingAllCompanies,
    records,
    refetch,
    totalCount,
  } = useWholesalerMapCompanies();
  const unassignedOwnerName = t`Unassigned`;
  const {
    countryOptions,
    featureCollection,
    filters,
    hasActiveFilters,
    ownerOptions,
    postcodeOptions,
    resetFilters,
    setSelectedCountry,
    setSelectedOwnerId,
    setSelectedPostcode,
    setSelectedState,
    stateOptions,
  } = useWholesalerMapFilters({
    companies: records,
    ownerColors: WHOLESALER_COVERAGE_MAP_COLORS.owners,
    unassignedOwnerColor: WHOLESALER_COVERAGE_MAP_COLORS.unassignedOwner,
    unassignedOwnerName,
  });
  const loadError = isDefined(error) ? new Error(error.message) : null;

  // Canvas points cannot render React Router links.
  // oxlint-disable-next-line twenty/no-navigate-prefer-link
  const handleCompanySelect = (companyId: string) => {
    navigate(
      getAppPath(AppPath.RecordShowPage, {
        objectNameSingular: CoreObjectNameSingular.Company,
        objectRecordId: companyId,
      }),
    );
  };

  const header = (
    <PageCardHeader
      icon={<IconMap size={16} />}
      title={<StyledPageHeading>{t`Territory map`}</StyledPageHeading>}
    />
  );

  if (!canViewMap) {
    return (
      <>
        <PageTitle title={t`Territory map | Twenty`} />
        <PageCardLayout header={header}>
          <RecordIndexEmptyStateNotShared />
        </PageCardLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t`Territory map | Twenty`} />
      <PageCardLayout header={header}>
        <WholesalerMapContent
          countryOptions={countryOptions}
          featureCollection={featureCollection}
          hasActiveFilters={hasActiveFilters}
          hasWholesalerRelation={hasWholesalerRelation}
          isLoading={isLoadingAllCompanies}
          loadError={loadError}
          onCompanySelect={handleCompanySelect}
          onCountryChange={setSelectedCountry}
          onOwnerChange={setSelectedOwnerId}
          onPostcodeChange={setSelectedPostcode}
          onResetFilters={resetFilters}
          onRetry={() => void refetch()}
          onStateChange={setSelectedState}
          ownerOptions={ownerOptions}
          postcodeOptions={postcodeOptions}
          selectedCountry={filters.country}
          selectedOwnerId={filters.ownerId}
          selectedPostcode={filters.postcode}
          selectedState={filters.state}
          stateOptions={stateOptions}
          totalCompanyCount={totalCount ?? records.length}
        />
      </PageCardLayout>
    </>
  );
};
