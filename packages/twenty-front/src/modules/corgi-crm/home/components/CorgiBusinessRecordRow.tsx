import {
  StyledCorgiBadge,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { type CorgiBusinessRecord } from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiDateTime,
  formatCorgiMoney,
  getCorgiObjectLabel,
} from '@/corgi-crm/utils/corgiHomePresentation';

export const CorgiBusinessRecordRow = ({
  record,
}: {
  record: CorgiBusinessRecord;
}) => (
  <StyledCorgiRow>
    <StyledCorgiStack>
      <CorgiRecordLink record={record} />
      <StyledCorgiMuted>
        <StyledCorgiBadge data-kind={record.objectNameSingular}>
          {getCorgiObjectLabel(record.objectNameSingular)}
        </StyledCorgiBadge>{' '}
        {record.subtitle} {record.createdBy} ·{' '}
        {formatCorgiDateTime(record.createdAt)}
      </StyledCorgiMuted>
    </StyledCorgiStack>
    {record.amounts && <strong>{formatCorgiMoney(record.amounts)}</strong>}
  </StyledCorgiRow>
);
