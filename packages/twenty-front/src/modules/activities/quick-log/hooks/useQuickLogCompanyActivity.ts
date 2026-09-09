import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { QUICK_LOG_ACTIVITY_TYPES } from '@/activities/quick-log/constants/quickLogActivityTypes';
import { QUICK_LOG_OUTCOMES } from '@/activities/quick-log/constants/quickLogOutcomes';
import { type QuickLogActivityFormValues } from '@/activities/quick-log/types/QuickLogActivityFormValues';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type UseQuickLogCompanyActivityParameters = {
  companyId: string;
};

const getPersonLabel = (record: Record<string, unknown>): string => {
  const name = record.name;

  if (!name || typeof name !== 'object') {
    return 'Unnamed contact';
  }

  const { firstName, lastName } = name as Record<string, unknown>;
  const fullName = [firstName, lastName]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim();

  return fullName || 'Unnamed contact';
};

export const useQuickLogCompanyActivity = ({
  companyId,
}: UseQuickLogCompanyActivityParameters) => {
  const { t } = useLingui();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUserEmail = currentWorkspaceMember?.userEmail
    ?.trim()
    .toLowerCase();

  const {
    records: wholesalerRecords,
    loading: isWholesalerLoading,
    error: wholesalerError,
  } = useFindManyRecords({
    objectNameSingular: 'wholesaler',
    filter: { email: { eq: currentUserEmail ?? '' } },
    recordGqlFields: { id: true, email: true },
    limit: 2,
    skip: !currentUserEmail,
  });

  const {
    records: peopleRecords,
    loading: arePeopleLoading,
    error: peopleError,
  } = useFindManyRecords({
    objectNameSingular: 'person',
    filter: { companyId: { eq: companyId } },
    recordGqlFields: { id: true, name: true },
    limit: 100,
  });

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'outreachActivity',
    shouldMatchRootQueryFilter: true,
  });

  const contactOptions = peopleRecords.map((person) => ({
    value: person.id,
    label: getPersonLabel(person),
  }));
  const matchingWholesalerRecords = wholesalerRecords.filter(
    (wholesaler) =>
      typeof wholesaler.email === 'string' &&
      wholesaler.email.trim().toLowerCase() === currentUserEmail,
  );

  let ownershipError: string | null = null;

  if (!currentUserEmail) {
    ownershipError = t`Your signed-in email is unavailable.`;
  } else if (wholesalerError) {
    ownershipError = t`Your wholesaler profile could not be verified.`;
  } else if (!isWholesalerLoading && matchingWholesalerRecords.length === 0) {
    ownershipError = t`No wholesaler profile is linked to your email.`;
  } else if (!isWholesalerLoading && matchingWholesalerRecords.length > 1) {
    ownershipError = t`More than one wholesaler profile is linked to your email.`;
  }

  const submitActivity = async (
    values: QuickLogActivityFormValues,
  ): Promise<boolean> => {
    const wholesalerId = matchingWholesalerRecords[0]?.id;

    if (ownershipError || !wholesalerId) {
      enqueueErrorSnackBar({
        message: ownershipError ?? t`Your wholesaler profile is unavailable.`,
      });
      return false;
    }

    const activityTypeOption =
      QUICK_LOG_ACTIVITY_TYPES.find(
        ({ value }) => value === values.activityType,
      ) ?? QUICK_LOG_ACTIVITY_TYPES[0];
    const outcomeOption =
      QUICK_LOG_OUTCOMES.find(({ value }) => value === values.outcome) ??
      QUICK_LOG_OUTCOMES[0];

    setIsSubmitting(true);

    try {
      await createOneRecord({
        name: `${t(activityTypeOption.label)} · ${t(outcomeOption.label)}`,
        companyId,
        wholesalerId,
        activityType: values.activityType,
        outcome: values.outcome,
        occurredAt: new Date().toISOString(),
        notes: values.notes.trim() || null,
        ...(values.contactId ? { contactId: values.contactId } : {}),
        ...(values.followUpDate ? { followUpDate: values.followUpDate } : {}),
      });

      enqueueSuccessSnackBar({ message: t`Follow-up logged.` });
      return true;
    } catch {
      enqueueErrorSnackBar({ message: t`Could not log the follow-up.` });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    contactOptions,
    isContactLoading: arePeopleLoading,
    contactError: peopleError ? t`Contacts could not be loaded.` : null,
    isOwnershipLoading: isWholesalerLoading,
    ownershipError,
    isSubmitting,
    submitActivity,
  };
};
