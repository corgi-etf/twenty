import {
  StyledCorgiActions,
  StyledCorgiBadge,
  StyledCorgiHeading,
  StyledCorgiInput,
  StyledCorgiMuted,
  StyledCorgiPanel,
  StyledCorgiRow,
  StyledCorgiSelect,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiPagination } from '@/corgi-crm/home/components/CorgiPagination';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiPagedResource } from '@/corgi-crm/home/hooks/useCorgiPagedResource';
import {
  type CorgiHomeQuery,
  type CorgiLegacyFollowUp,
} from '@/corgi-crm/types/CorgiHome';
import { formatCorgiDateTime } from '@/corgi-crm/utils/corgiHomePresentation';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';

export const CorgiLegacyFollowUps = ({
  workspaceMemberId,
  initialScope = 'assigned',
}: {
  workspaceMemberId?: string;
  initialScope?: NonNullable<CorgiHomeQuery['legacyScope']>;
}) => {
  const [scope, setScope] = useState<
    NonNullable<CorgiHomeQuery['legacyScope']>
  >(workspaceMemberId ? 'assigned' : initialScope);
  const [status, setStatus] =
    useState<NonNullable<CorgiHomeQuery['status']>>('open');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const query: CorgiHomeQuery = {
    section: 'legacyFollowUps',
    workspaceMemberId,
    legacyScope: scope,
    status,
    search: debouncedSearch,
  };

  return (
    <StyledCorgiPanel>
      <StyledCorgiHeading>
        <Trans>Legacy follow-ups</Trans>
      </StyledCorgiHeading>
      <StyledCorgiMuted>
        {scope === 'assigned'
          ? t`Earlier tasks assigned to this person. Original scheduler unknown.`
          : t`Unassigned or unavailable tasks from activities you can access. Original scheduler unknown.`}
      </StyledCorgiMuted>
      <StyledCorgiActions>
        <StyledCorgiInput
          aria-label={t`Search legacy follow-ups`}
          placeholder={t`Search companies or reminders`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledCorgiSelect
          aria-label={t`Legacy follow-up status`}
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="open">{t`Open`}</option>
          <option value="completed">{t`Completed`}</option>
          <option value="all">{t`All history`}</option>
        </StyledCorgiSelect>
        {!workspaceMemberId && (
          <StyledCorgiSelect
            aria-label={t`Legacy follow-up assignment`}
            value={scope}
            onChange={(event) => setScope(event.target.value as typeof scope)}
          >
            <option value="assigned">{t`Assigned to me`}</option>
            <option value="unassigned">{t`Unassigned or unavailable tasks`}</option>
          </StyledCorgiSelect>
        )}
      </StyledCorgiActions>
      <CorgiLegacyFollowUpResults key={JSON.stringify(query)} query={query} />
    </StyledCorgiPanel>
  );
};

const CorgiLegacyFollowUpResults = ({ query }: { query: CorgiHomeQuery }) => {
  const { data, loading, error, refetch, ...pagination } =
    useCorgiPagedResource<CorgiLegacyFollowUp>(query);

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
          {data.records.map((record) => (
            <StyledCorgiRow key={record.activity.id}>
              <StyledCorgiStack>
                {record.company ? (
                  <CorgiRecordLink record={record.company} />
                ) : (
                  <StyledCorgiMuted>
                    {record.companyStatus === 'restricted'
                      ? t`Unavailable company`
                      : t`Needs company link`}
                  </StyledCorgiMuted>
                )}
                {record.task ? (
                  <CorgiRecordLink record={record.task} />
                ) : (
                  <StyledCorgiMuted>
                    {record.taskAvailability === 'restricted'
                      ? t`Task unavailable`
                      : t`No task linked`}
                  </StyledCorgiMuted>
                )}
                <StyledCorgiBadge>
                  {record.status === 'DONE'
                    ? t`Completed`
                    : record.status === 'IN_PROGRESS'
                      ? t`In progress`
                      : record.status === 'TODO'
                        ? t`To do`
                        : t`Assignment unknown`}
                </StyledCorgiBadge>
                <StyledCorgiMuted>
                  {record.dueAt ? (
                    formatCorgiDateTime(record.dueAt)
                  ) : record.followUpDate ? (
                    <>
                      <Trans>Activity follow-up date</Trans>:{' '}
                      {record.followUpDate.slice(0, 10)}
                    </>
                  ) : (
                    t`No due date`
                  )}
                </StyledCorgiMuted>
                <StyledCorgiMuted>
                  <Trans>Source activity</Trans>:{' '}
                  <CorgiRecordLink record={record.activity} />
                </StyledCorgiMuted>
              </StyledCorgiStack>
            </StyledCorgiRow>
          ))}
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
