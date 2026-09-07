import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath, CoreObjectNameSingular } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { IconMap } from 'twenty-ui/icon';
import { useTheme } from 'twenty-ui/theme-constants';

import { RecordIndexEmptyStateNotShared } from '@/object-record/record-index/components/RecordIndexEmptyStateNotShared';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { WholesalerMapContent } from '@/wholesaler-map/components/WholesalerMapContent';
import { useWholesalerMapCompanies } from '@/wholesaler-map/hooks/useWholesalerMapCompanies';
import { getWholesalerMapOwnerOptions } from '@/wholesaler-map/utils/getWholesalerMapOwnerOptions';
import { normalizeWholesalerMapCompanies } from '@/wholesaler-map/utils/normalizeWholesalerMapCompanies';

export const WholesalerMapPage = () => {
  const { t } = useLingui();
  const theme = useTheme();
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
  const ownerColors = useMemo(
    () => [
      theme.color.blue9,
      theme.color.red9,
      theme.color.orange9,
      theme.color.green9,
      theme.color.sky9,
      theme.color.purple9,
      theme.color.yellow9,
      theme.color.turquoise9,
    ],
    [theme],
  );
  const featureCollection = useMemo(
    () =>
      normalizeWholesalerMapCompanies(
        records,
        selectedOwnerId,
        unassignedOwnerName,
        ownerColors,
        theme.color.gray9,
      ),
    [
      records,
      selectedOwnerId,
      unassignedOwnerName,
      ownerColors,
      theme.color.gray9,
    ],
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
      title={t`Wholesaler coverage`}
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
