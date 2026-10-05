import {
  StyledCorgiHeading,
  StyledCorgiMuted,
  StyledCorgiPanel,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiPagination } from '@/corgi-crm/home/components/CorgiPagination';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiPagedResource } from '@/corgi-crm/home/hooks/useCorgiPagedResource';
import {
  type CorgiMetric,
  type CorgiTeamMember,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiMoney,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledScroll = styled.div`
  overflow-x: auto;
`;
const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: 13px;
  width: 100%;
  th {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }
  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 12px 8px;
    white-space: nowrap;
  }
  a {
    color: ${themeCssVariables.font.color.primary};
  }
`;
const metricValue = (metric: CorgiMetric, money = false) =>
  metric.status === 'available'
    ? money
      ? formatCorgiMoney(metric.amounts ?? []) || t`No allocations`
      : metric.count?.toLocaleString()
    : metric.status === 'denied'
      ? t`No access`
      : t`Unavailable`;

export const CorgiTeamPerformance = ({
  workspaceMemberId,
}: {
  workspaceMemberId?: string;
}) => {
  const { data, loading, error, refetch, ...pagination } =
    useCorgiPagedResource<CorgiTeamMember>({
      section: 'team',
      workspaceMemberId,
    });
  return (
    <StyledCorgiPanel>
      <StyledCorgiHeading>
        <Trans>Team performance today</Trans>
      </StyledCorgiHeading>
      <StyledCorgiMuted>
        <Trans>
          Activities are owned by; meetings are booked/taken by; allocations are
          credited to. Includes employees with no activity.
        </Trans>
      </StyledCorgiMuted>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={data?.records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {data?.status === 'available' && (
        <>
          <StyledScroll>
            <StyledTable>
              <thead>
                <tr>
                  <th>
                    <Trans>Employee</Trans>
                  </th>
                  <th>
                    <Trans>Activities</Trans>
                  </th>
                  <th>
                    <Trans>Set</Trans>
                  </th>
                  <th>
                    <Trans>Taken</Trans>
                  </th>
                  <th>
                    <Trans>Credited allocations</Trans>
                  </th>
                  <th>
                    <Trans>Open follow-ups</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((member) => (
                  <tr key={member.workspaceMemberId}>
                    <td>
                      {member.person ? (
                        <CorgiRecordLink record={member.person} />
                      ) : (
                        member.name
                      )}
                    </td>
                    {(
                      [
                        'activities',
                        'meetingsSet',
                        'meetingsTaken',
                        'allocations',
                        'openFollowUps',
                      ] as const
                    ).map((key) => (
                      <td key={key}>
                        {member[key].status === 'available' ? (
                          <Link
                            to={getCorgiDrilldownPath({
                              section:
                                key === 'openFollowUps' ? 'followUps' : key,
                              workspaceMemberId: member.workspaceMemberId,
                              ...(key === 'openFollowUps'
                                ? { scope: 'assigned', status: 'open' }
                                : {}),
                            })}
                          >
                            {metricValue(member[key], key === 'allocations')}
                          </Link>
                        ) : (
                          metricValue(member[key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </StyledScroll>
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
    </StyledCorgiPanel>
  );
};
