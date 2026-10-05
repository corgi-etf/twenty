import {
  StyledCorgiButton,
  StyledCorgiMuted,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { type CorgiAvailability } from '@/corgi-crm/types/CorgiHome';
import { Trans } from '@lingui/react/macro';

export const CorgiSectionState = ({
  loading,
  error,
  status,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: unknown;
  status?: CorgiAvailability;
  empty?: boolean;
  retry?: () => void;
}) => {
  if (error || status === 'unavailable')
    return (
      <div role="status">
        <StyledCorgiMuted>
          <Trans>This information is currently unavailable.</Trans>
        </StyledCorgiMuted>{' '}
        {retry && (
          <StyledCorgiButton onClick={retry}>
            <Trans>Retry</Trans>
          </StyledCorgiButton>
        )}
      </div>
    );
  if (status === 'denied')
    return (
      <StyledCorgiMuted>
        <Trans>You do not have access to this information.</Trans>
      </StyledCorgiMuted>
    );
  if (loading)
    return (
      <StyledCorgiMuted role="status">
        <Trans>Loading…</Trans>
      </StyledCorgiMuted>
    );
  return empty ? (
    <StyledCorgiMuted>
      <Trans>No matching records.</Trans>
    </StyledCorgiMuted>
  ) : null;
};
