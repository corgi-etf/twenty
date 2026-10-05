import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { CorgiBusinessRecordRow } from '@/corgi-crm/home/components/CorgiBusinessRecordRow';
import {
  StyledCorgiActions,
  StyledCorgiHeading,
  StyledCorgiMuted,
  StyledCorgiPanel,
  StyledCorgiSelect,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiPagination } from '@/corgi-crm/home/components/CorgiPagination';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiPagedResource } from '@/corgi-crm/home/hooks/useCorgiPagedResource';
import { type CorgiBusinessRecord } from '@/corgi-crm/types/CorgiHome';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

export const CorgiActiveClients = () => {
  const [scope, setScope] = useState('team');
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  return (
    <StyledCorgiPanel>
      <StyledCorgiActions>
        <StyledCorgiHeading>
          <Trans>Clients marked active</Trans>
        </StyledCorgiHeading>
        <StyledCorgiSelect
          aria-label={t`Active client ownership`}
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="team">{t`Team clients`}</option>
          <option value="mine">{t`My clients`}</option>
        </StyledCorgiSelect>
      </StyledCorgiActions>
      <StyledCorgiMuted>
        <Trans>
          Staff-controlled client status. Separate from allocation-based Current
          clients.
        </Trans>
      </StyledCorgiMuted>
      <CorgiActiveClientResults
        key={scope}
        workspaceMemberId={
          scope === 'mine' ? currentWorkspaceMember?.id : undefined
        }
      />
    </StyledCorgiPanel>
  );
};

const CorgiActiveClientResults = ({
  workspaceMemberId,
}: {
  workspaceMemberId?: string;
}) => {
  const { data, error, loading, refetch, ...pagination } =
    useCorgiPagedResource<CorgiBusinessRecord>({
      section: 'activeClients',
      workspaceMemberId,
    });
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
            <CorgiBusinessRecordRow key={record.id} record={record} />
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
