import {
  StyledCorgiActions,
  StyledCorgiButton,
  StyledCorgiMuted,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { Trans } from '@lingui/react/macro';

export const CorgiPagination = ({
  pageNumber,
  nextCursor,
  totalCount,
  loading,
  nextPage,
  previousPage,
}: {
  pageNumber: number;
  nextCursor?: string | null;
  totalCount?: number | null;
  loading: boolean;
  nextPage: () => void;
  previousPage: () => void;
}) => (
  <StyledCorgiActions>
    <StyledCorgiButton
      disabled={loading || pageNumber === 1}
      onClick={previousPage}
    >
      <Trans>Previous</Trans>
    </StyledCorgiButton>
    <StyledCorgiMuted>
      <Trans>Page {pageNumber}</Trans>
      {totalCount !== null && totalCount !== undefined && (
        <>
          {' '}
          · <Trans>{totalCount} results</Trans>
        </>
      )}
    </StyledCorgiMuted>
    <StyledCorgiButton disabled={loading || !nextCursor} onClick={nextPage}>
      <Trans>Next</Trans>
    </StyledCorgiButton>
  </StyledCorgiActions>
);
