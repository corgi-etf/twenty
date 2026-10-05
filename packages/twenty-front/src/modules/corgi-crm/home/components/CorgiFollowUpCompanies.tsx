import { CorgiFollowUpRow } from '@/corgi-crm/home/components/CorgiFollowUpRow';
import {
  StyledCorgiActions,
  StyledCorgiHeading,
  StyledCorgiInput,
  StyledCorgiMuted,
  StyledCorgiPanel,
  StyledCorgiSelect,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiPagination } from '@/corgi-crm/home/components/CorgiPagination';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiPagedResource } from '@/corgi-crm/home/hooks/useCorgiPagedResource';
import {
  type CorgiFollowUpCompany,
  type CorgiHomeQuery,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiDateTime,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useDebounce } from 'use-debounce';

const StyledGroup = styled.details`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: 14px 0;
  summary {
    cursor: pointer;
  }
  summary > span {
    margin-left: 8px;
  }
`;

export const CorgiFollowUpCompanies = ({
  workspaceMemberId,
}: {
  workspaceMemberId?: string;
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const [status, setStatus] =
    useState<NonNullable<CorgiHomeQuery['status']>>('open');
  const [scope, setScope] =
    useState<NonNullable<CorgiHomeQuery['scope']>>('scheduled');
  return (
    <StyledCorgiPanel>
      <StyledCorgiHeading>
        {workspaceMemberId ? t`Follow-up companies` : t`My follow-up companies`}
      </StyledCorgiHeading>
      <StyledCorgiMuted>
        <Trans>
          Companies flagged by this person, including future reminders. History
          remains after reassignment.
        </Trans>
      </StyledCorgiMuted>
      <StyledCorgiActions>
        <StyledCorgiInput
          aria-label={t`Search follow-up companies`}
          placeholder={t`Search companies`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledCorgiSelect
          aria-label={t`Follow-up status`}
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="open">{t`Open`}</option>
          <option value="completed">{t`Completed`}</option>
          <option value="all">{t`All history`}</option>
        </StyledCorgiSelect>
        <StyledCorgiSelect
          aria-label={t`Follow-up attribution`}
          value={scope}
          onChange={(event) => setScope(event.target.value as typeof scope)}
        >
          <option value="scheduled">{t`Scheduled by this person`}</option>
          <option value="assigned">{t`Assigned to this person`}</option>
        </StyledCorgiSelect>
      </StyledCorgiActions>
      <CorgiFollowUpCompanyResults
        key={`${workspaceMemberId}:${debouncedSearch}:${status}:${scope}`}
        query={{
          section: 'followUpCompanies',
          workspaceMemberId,
          search: debouncedSearch,
          status,
          scope,
        }}
      />
    </StyledCorgiPanel>
  );
};

const CorgiFollowUpCompanyResults = ({ query }: { query: CorgiHomeQuery }) => {
  const { data, loading, error, refetch, ...pagination } =
    useCorgiPagedResource<CorgiFollowUpCompany>(query);
  return (
    <>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={data?.records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {data?.status === 'available' &&
        data.records.map((group) => (
          <StyledGroup key={group.company?.id ?? 'unlinked'}>
            <summary>
              {group.company ? (
                <CorgiRecordLink record={group.company} />
              ) : (
                <Trans>Needs company link</Trans>
              )}{' '}
              <StyledCorgiMuted>
                {group.openCount} <Trans>open</Trans> · {group.totalCount}{' '}
                <Trans>reminders</Trans>
              </StyledCorgiMuted>
            </summary>
            <StyledCorgiStack>
              <StyledCorgiMuted>
                {group.nextDueAt && (
                  <>
                    <Trans>Next due</Trans>:{' '}
                    {formatCorgiDateTime(group.nextDueAt)} ·{' '}
                  </>
                )}
                {group.lastActivityAt && (
                  <>
                    <Trans>Last activity</Trans>:{' '}
                    {formatCorgiDateTime(group.lastActivityAt)}
                  </>
                )}
              </StyledCorgiMuted>
              {group.reminders.map((reminder) => (
                <CorgiFollowUpRow
                  key={reminder.id}
                  reminder={reminder}
                  showCompany={false}
                />
              ))}
              {group.nextReminderCursor && (
                <Link
                  to={getCorgiDrilldownPath({
                    ...query,
                    section: 'followUps',
                    companyId: group.company?.id ?? 'unlinked',
                  })}
                >
                  <Trans>View all reminders</Trans>
                </Link>
              )}
            </StyledCorgiStack>
          </StyledGroup>
        ))}
      {data?.status === 'available' && (
        <CorgiPagination
          pageNumber={pagination.pageNumber}
          nextPage={pagination.nextPage}
          previousPage={pagination.previousPage}
          nextCursor={data.nextCursor}
          totalCount={data.totalCount}
          loading={loading}
        />
      )}
    </>
  );
};
