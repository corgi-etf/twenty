import { CorgiBusinessRecordRow } from '@/corgi-crm/home/components/CorgiBusinessRecordRow';
import { CorgiClientCompanies } from '@/corgi-crm/home/components/CorgiClientCompanies';
import { CorgiFollowUpCompanies } from '@/corgi-crm/home/components/CorgiFollowUpCompanies';
import { CorgiLegacyFollowUps } from '@/corgi-crm/home/components/CorgiLegacyFollowUps';
import { CorgiFollowUpRow } from '@/corgi-crm/home/components/CorgiFollowUpRow';
import {
  StyledCorgiInput,
  StyledCorgiMuted,
  StyledCorgiPanel,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiMeetingRow } from '@/corgi-crm/home/components/CorgiMeetingRow';
import { CorgiPagination } from '@/corgi-crm/home/components/CorgiPagination';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { CorgiTeamPerformance } from '@/corgi-crm/home/components/CorgiTeamPerformance';
import { CorgiWinRow } from '@/corgi-crm/home/components/CorgiWinRow';
import { useCorgiPagedResource } from '@/corgi-crm/home/hooks/useCorgiPagedResource';
import {
  type CorgiBusinessRecord,
  type CorgiClientCompany,
  type CorgiFollowUp,
  type CorgiHomeQuery,
  type CorgiMeeting,
  type CorgiWin,
} from '@/corgi-crm/types/CorgiHome';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';

type DrilldownRecord =
  | CorgiBusinessRecord
  | CorgiClientCompany
  | CorgiFollowUp
  | CorgiMeeting
  | CorgiWin;

export const CorgiDrilldown = ({ query }: { query: CorgiHomeQuery }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  if (query.section === 'legacyFollowUps')
    return (
      <CorgiLegacyFollowUps
        workspaceMemberId={query.workspaceMemberId}
        initialScope={query.legacyScope}
      />
    );
  if (query.section === 'team')
    return <CorgiTeamPerformance workspaceMemberId={query.workspaceMemberId} />;
  if (query.section === 'followUpCompanies')
    return (
      <CorgiFollowUpCompanies workspaceMemberId={query.workspaceMemberId} />
    );
  return (
    <StyledCorgiPanel>
      {query.section === 'currentClients' && (
        <p>
          <StyledCorgiMuted>
            <Trans>
              Distinct companies with valid allocations across all time. This
              computed list is independent of the manually selected Active
              client status.
            </Trans>
          </StyledCorgiMuted>
        </p>
      )}
      <StyledCorgiInput
        aria-label={t`Search records`}
        placeholder={t`Search records`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <CorgiDrilldownResults
        key={`${JSON.stringify(query)}:${debouncedSearch}`}
        query={{ ...query, search: debouncedSearch }}
      />
    </StyledCorgiPanel>
  );
};

const CorgiDrilldownResults = ({ query }: { query: CorgiHomeQuery }) => {
  const { data, loading, error, refetch, ...pagination } =
    useCorgiPagedResource<DrilldownRecord>(query);
  return (
    <>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={data?.records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {data?.status === 'available' && (
        <>
          {data.records.map((record) => {
            if ('allocationCount' in record)
              return (
                <CorgiClientCompanies
                  key={record.company.id}
                  clients={[record]}
                />
              );
            if ('kind' in record)
              return <CorgiWinRow key={record.id} win={record} />;
            if ('dueAt' in record)
              return <CorgiFollowUpRow key={record.id} reminder={record} />;
            if ('scheduledAt' in record)
              return <CorgiMeetingRow key={record.id} meeting={record} />;
            return (
              <CorgiBusinessRecordRow
                key={`${record.objectNameSingular}:${record.id}`}
                record={record}
              />
            );
          })}
          <CorgiPagination
            pageNumber={pagination.pageNumber}
            nextPage={pagination.nextPage}
            previousPage={pagination.previousPage}
            nextCursor={data.nextCursor}
            totalCount={data.totalCount}
            loading={loading}
          />
        </>
      )}
    </>
  );
};
