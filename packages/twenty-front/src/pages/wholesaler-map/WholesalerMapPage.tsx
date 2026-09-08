import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
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
import { getWholesalerMapOwnerOptions } from '@/wholesaler-map/utils/getWholesalerMapOwnerOptions';
import { normalizeWholesalerMapCompanies } from '@/wholesaler-map/utils/normalizeWholesalerMapCompanies';

const StyledPageHeading = styled.h1`
  color: inherit;
  font: inherit;
  margin: 0;
`;

export const WholesalerMapPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
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
  const featureCollection = useMemo(
    () =>
      normalizeWholesalerMapCompanies(
        records,
        selectedOwnerId,
        unassignedOwnerName,
        WHOLESALER_COVERAGE_MAP_COLORS.owners,
        WHOLESALER_COVERAGE_MAP_COLORS.unassignedOwner,
      ),
    [records, selectedOwnerId, unassignedOwnerName],
  );
  const ownerOptions = useMemo(
    () => getWholesalerMapOwnerOptions(records, unassignedOwnerName),
    [records, unassignedOwnerName],
  );
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
      title={<StyledPageHeading>{t`Wholesaler coverage`}</StyledPageHeading>}
    />
  );

  if (!canViewMap) {
    return (
      <>
        <PageTitle title={t`Wholesaler coverage | Twenty`} />
        <PageCardLayout header={header}>
          <RecordIndexEmptyStateNotShared />
        </PageCardLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t`Wholesaler coverage | Twenty`} />
      <PageCardLayout header={header}>
        <WholesalerMapContent
          featureCollection={featureCollection}
          hasWholesalerRelation={hasWholesalerRelation}
          isLoading={isLoadingAllCompanies}
          loadError={loadError}
          onCompanySelect={handleCompanySelect}
          onOwnerChange={setSelectedOwnerId}
          onRetry={() => void refetch()}
          ownerOptions={ownerOptions}
          selectedOwnerId={selectedOwnerId}
          totalCompanyCount={totalCount ?? records.length}
        />
      </PageCardLayout>
    </>
  );
};
