import {
  StyledCorgiBadge,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';
import { formatCorgiDateTime } from '@/corgi-crm/utils/corgiHomePresentation';
import { t } from '@lingui/core/macro';

export const CorgiWinRow = ({ win }: { win: CorgiWin }) => (
  <StyledCorgiRow>
    <StyledCorgiStack>
      <StyledCorgiBadge data-kind={win.kind}>
        {win.kind === 'meeting-booked'
          ? t`Meeting booked`
          : win.kind === 'meeting-taken'
            ? t`Meeting taken`
            : t`Allocation logged`}
      </StyledCorgiBadge>
      <CorgiRecordLink record={win.record} />
      <StyledCorgiMuted>
        {win.actorName} · {formatCorgiDateTime(win.recordedAt)}
      </StyledCorgiMuted>
    </StyledCorgiStack>
  </StyledCorgiRow>
);
