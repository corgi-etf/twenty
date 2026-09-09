import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  QUICK_LOG_ACTIVITY_TYPES,
  type QuickLogActivityType,
} from '@/activities/quick-log/constants/quickLogActivityTypes';
import {
  QUICK_LOG_OUTCOMES,
  type QuickLogOutcome,
} from '@/activities/quick-log/constants/quickLogOutcomes';
import { Select } from '@/ui/input/components/Select';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';

type ContactOption = {
  value: string;
  label: string;
};

type QuickLogCompanyActivityFieldsProps = {
  instanceId: string;
  activityType: QuickLogActivityType;
  outcome: QuickLogOutcome;
  notes: string;
  contactId: string | null;
  followUpDate: string;
  contactOptions: ContactOption[];
  isContactLoading: boolean;
  onActivityTypeChange: (value: QuickLogActivityType) => void;
  onOutcomeChange: (value: QuickLogOutcome) => void;
  onNotesChange: (value: string) => void;
  onContactIdChange: (value: string | null) => void;
  onFollowUpDateChange: (value: string) => void;
};

const StyledFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

export const QuickLogCompanyActivityFields = ({
  instanceId,
  activityType,
  outcome,
  notes,
  contactId,
  followUpDate,
  contactOptions,
  isContactLoading,
  onActivityTypeChange,
  onOutcomeChange,
  onNotesChange,
  onContactIdChange,
  onFollowUpDateChange,
}: QuickLogCompanyActivityFieldsProps) => {
  const { t } = useLingui();

  return (
    <StyledFields>
      <Select
        dropdownId={`${instanceId}-activity-type`}
        label={t`Activity`}
        value={activityType}
        options={QUICK_LOG_ACTIVITY_TYPES.map((option) => ({
          value: option.value,
          label: t(option.label),
        }))}
        onChange={onActivityTypeChange}
        isDropdownInModal
        fullWidth
      />
      <Select
        dropdownId={`${instanceId}-outcome`}
        label={t`Outcome`}
        value={outcome}
        options={QUICK_LOG_OUTCOMES.map((option) => ({
          value: option.value,
          label: t(option.label),
        }))}
        onChange={onOutcomeChange}
        isDropdownInModal
        fullWidth
      />
      <Select<string | null>
        dropdownId={`${instanceId}-contact`}
        label={t`Contact person`}
        value={contactId}
        emptyOption={{ value: null, label: t`No contact selected` }}
        options={contactOptions}
        onChange={onContactIdChange}
        disabled={isContactLoading}
        isDropdownInModal
        fullWidth
      />
      <TextArea
        textAreaId={`${instanceId}-notes`}
        label={t`Notes`}
        placeholder={t`What happened?`}
        value={notes}
        onChange={onNotesChange}
        minRows={3}
        maxRows={6}
      />
      <SettingsTextInput
        instanceId={`${instanceId}-follow-up-date`}
        label={t`Next follow-up (optional)`}
        type="date"
        value={followUpDate}
        onChange={onFollowUpDateChange}
        fullWidth
      />
    </StyledFields>
  );
};
