import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiBadge,
  StyledCorgiHeading,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import {
  formatCorgiDateTime,
  getCorgiObjectLabel,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';

const StyledRecords = styled.div`
  &[data-compact='true'] {
    display: flex;
    gap: 18px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  &[data-compact='true'] > div {
    border: 0;
    flex: 0 0 auto;
    max-width: 270px;
    padding: 4px 0;
  }
`;
export const CorgiLatestRecords = ({
  compact = false,
}: {
  compact?: boolean;
}) => {
  const { summary, loading, error, refresh } = useCorgiHome();
  const page = summary?.latestRecords;
  return (
    <div>
      {!compact && (
        <StyledCorgiHeading>
          <Trans>Latest five saved records</Trans>
        </StyledCorgiHeading>
      )}
      <CorgiSectionState
        loading={!summary && loading}
        error={error}
        status={page?.status}
        empty={page?.records.length === 0}
        retry={refresh}
      />
      <StyledRecords data-compact={compact}>
        {page?.status === 'available' &&
          page.records.map((record) => (
            <StyledCorgiRow key={`${record.objectNameSingular}:${record.id}`}>
              <StyledCorgiStack>
                <CorgiRecordLink record={record} />
                <StyledCorgiMuted>
                  <StyledCorgiBadge data-kind={record.objectNameSingular}>
                    {getCorgiObjectLabel(record.objectNameSingular)}
                  </StyledCorgiBadge>{' '}
                  {record.createdBy} · {formatCorgiDateTime(record.createdAt)}
                </StyledCorgiMuted>
              </StyledCorgiStack>
            </StyledCorgiRow>
          ))}
      </StyledRecords>
    </div>
  );
};
