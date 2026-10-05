import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiButton,
  StyledCorgiBadge,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { type CorgiFollowUp } from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiDateTime,
  getCorgiFollowUpTiming,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

export const CorgiFollowUpRow = ({
  reminder,
  showCompany = true,
}: {
  reminder: CorgiFollowUp;
  showCompany?: boolean;
}) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { refresh } = useCorgiHome();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const complete = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await updateOneRecord({
        objectNameSingular: 'outreachFollowUp',
        idToUpdate: reminder.id,
        updateOneRecordInput: { status: 'COMPLETED' },
        recordGqlFields: { id: true, status: true },
      });
      refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  const timing = reminder.dueAt
    ? getCorgiFollowUpTiming(reminder.dueAt, new Date())
    : null;
  return (
    <StyledCorgiRow>
      <StyledCorgiStack>
        <CorgiRecordLink record={reminder} />
        {timing && reminder.status === 'OPEN' && (
          <StyledCorgiBadge data-kind={timing}>
            {timing === 'overdue'
              ? t`Overdue`
              : timing === 'due-today'
                ? t`Due today`
                : t`Upcoming`}
          </StyledCorgiBadge>
        )}
        {showCompany && reminder.company && (
          <CorgiRecordLink record={reminder.company} />
        )}
        {reminder.contact && <CorgiRecordLink record={reminder.contact} />}
        <StyledCorgiMuted>
          {reminder.dueAt
            ? formatCorgiDateTime(reminder.dueAt)
            : t`No due date`}{' '}
          · {reminder.reason ?? reminder.label}
        </StyledCorgiMuted>
        {!reminder.company && (
          <StyledCorgiMuted>
            <Trans>Needs company link</Trans>
          </StyledCorgiMuted>
        )}
        {error && (
          <span role="alert">
            <Trans>Could not complete this follow-up. Please try again.</Trans>
          </span>
        )}
      </StyledCorgiStack>
      {reminder.status === 'OPEN' && reminder.canComplete && (
        <StyledCorgiButton onClick={complete} disabled={saving}>
          {saving ? t`Saving…` : t`Complete`}
        </StyledCorgiButton>
      )}
    </StyledCorgiRow>
  );
};
