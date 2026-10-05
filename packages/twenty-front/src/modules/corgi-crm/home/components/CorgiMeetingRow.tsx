import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiActions,
  StyledCorgiBadge,
  StyledCorgiButton,
  StyledCorgiInput,
  StyledCorgiMuted,
  StyledCorgiRow,
  StyledCorgiStack,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiRecordLink } from '@/corgi-crm/home/components/CorgiRecordLink';
import { type CorgiMeeting } from '@/corgi-crm/types/CorgiHome';
import {
  CORGI_REPORTING_TIME_ZONE,
  formatCorgiDateTime,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { useState } from 'react';

export const CorgiMeetingRow = ({ meeting }: { meeting: CorgiMeeting }) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { refresh } = useCorgiHome();
  const [heldAt, setHeldAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const markTaken = async () => {
    if (saving || !heldAt) return;
    setSaving(true);
    setError(false);
    try {
      await updateOneRecord({
        objectNameSingular: 'meetingBooking',
        idToUpdate: meeting.id,
        updateOneRecordInput: {
          status: 'COMPLETED',
          heldAt: fromZonedTime(
            heldAt,
            CORGI_REPORTING_TIME_ZONE,
          ).toISOString(),
        },
        recordGqlFields: { id: true, status: true, heldAt: true },
      });
      setHeldAt(null);
      refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <StyledCorgiRow>
      <StyledCorgiStack>
        <CorgiRecordLink record={meeting} />
        <StyledCorgiMuted>
          {formatCorgiDateTime(meeting.scheduledAt)} ·{' '}
          <StyledCorgiBadge>{meeting.status}</StyledCorgiBadge>
        </StyledCorgiMuted>
        {meeting.company && <CorgiRecordLink record={meeting.company} />}
        {meeting.contact && <CorgiRecordLink record={meeting.contact} />}
        {meeting.owner && (
          <StyledCorgiMuted>
            <Trans>Owner</Trans>: <CorgiRecordLink record={meeting.owner} />
          </StyledCorgiMuted>
        )}
        {heldAt !== null && (
          <StyledCorgiActions>
            <label>
              <Trans>Actual meeting time (America/Chicago)</Trans>
              <StyledCorgiInput
                aria-label={t`Actual meeting time`}
                type="datetime-local"
                value={heldAt}
                onChange={(event) => setHeldAt(event.target.value)}
              />
            </label>
            <StyledCorgiButton disabled={saving || !heldAt} onClick={markTaken}>
              {saving ? t`Saving…` : t`Save`}
            </StyledCorgiButton>
            <StyledCorgiButton
              disabled={saving}
              onClick={() => {
                setHeldAt(null);
                setError(false);
              }}
            >
              <Trans>Cancel</Trans>
            </StyledCorgiButton>
          </StyledCorgiActions>
        )}
        {error && (
          <span role="alert">
            <Trans>Could not update this meeting. Please try again.</Trans>
          </span>
        )}
      </StyledCorgiStack>
      {meeting.canMarkTaken && heldAt === null && (
        <StyledCorgiButton
          onClick={() =>
            setHeldAt(
              formatInTimeZone(
                new Date(),
                CORGI_REPORTING_TIME_ZONE,
                "yyyy-MM-dd'T'HH:mm",
              ),
            )
          }
        >
          <Trans>Mark taken</Trans>
        </StyledCorgiButton>
      )}
    </StyledCorgiRow>
  );
};
