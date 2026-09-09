import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type FormEvent, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { QuickLogCompanyActivityFields } from '@/activities/quick-log/components/QuickLogCompanyActivityFields';
import {
  QUICK_LOG_ACTIVITY_TYPES,
  type QuickLogActivityType,
} from '@/activities/quick-log/constants/quickLogActivityTypes';
import {
  QUICK_LOG_OUTCOMES,
  type QuickLogOutcome,
} from '@/activities/quick-log/constants/quickLogOutcomes';
import { useQuickLogCompanyActivity } from '@/activities/quick-log/hooks/useQuickLogCompanyActivity';

type QuickLogCompanyActivityFormProps = {
  companyId: string;
  instanceId: string;
  onCancel: () => void;
  onLogged: () => void;
};

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledMessage = styled.div<{ $isError?: boolean }>`
  color: ${({ $isError }) =>
    $isError
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[2]};

  > div {
    flex: 1;
  }
`;

export const QuickLogCompanyActivityForm = ({
  companyId,
  instanceId,
  onCancel,
  onLogged,
}: QuickLogCompanyActivityFormProps) => {
  const { t } = useLingui();
  const [activityType, setActivityType] = useState<QuickLogActivityType>(
    QUICK_LOG_ACTIVITY_TYPES[0].value,
  );
  const [outcome, setOutcome] = useState<QuickLogOutcome>(
    QUICK_LOG_OUTCOMES[0].value,
  );
  const [notes, setNotes] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');

  const quickLog = useQuickLogCompanyActivity({ companyId });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const wasLogged = await quickLog.submitActivity({
      activityType,
      outcome,
      notes,
      contactId,
      followUpDate,
    });

    if (wasLogged) {
      onLogged();
    }
  };

  const isSubmitDisabled =
    quickLog.isSubmitting ||
    quickLog.isOwnershipLoading ||
    quickLog.ownershipError !== null;

  return (
    <StyledForm onSubmit={handleSubmit} aria-busy={quickLog.isSubmitting}>
      <QuickLogCompanyActivityFields
        instanceId={instanceId}
        activityType={activityType}
        outcome={outcome}
        notes={notes}
        contactId={contactId}
        followUpDate={followUpDate}
        contactOptions={quickLog.contactOptions}
        isContactLoading={quickLog.isContactLoading}
        onActivityTypeChange={setActivityType}
        onOutcomeChange={setOutcome}
        onNotesChange={setNotes}
        onContactIdChange={setContactId}
        onFollowUpDateChange={setFollowUpDate}
      />
      {quickLog.contactError && (
        <StyledMessage role="status">{quickLog.contactError}</StyledMessage>
      )}
      {quickLog.isOwnershipLoading && (
        <StyledMessage role="status">{t`Checking ownership…`}</StyledMessage>
      )}
      {quickLog.ownershipError && (
        <StyledMessage role="alert" $isError>
          {quickLog.ownershipError}
        </StyledMessage>
      )}
      <StyledActions>
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          title={t`Cancel`}
          fullWidth
          justify="center"
        />
        <Button
          type="submit"
          variant="primary"
          accent="blue"
          title={t`Log follow-up`}
          disabled={isSubmitDisabled}
          isLoading={quickLog.isSubmitting}
          fullWidth
          justify="center"
        />
      </StyledActions>
    </StyledForm>
  );
};
