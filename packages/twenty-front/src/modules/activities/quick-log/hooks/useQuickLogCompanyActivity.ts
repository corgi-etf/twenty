import { useLingui } from '@lingui/react/macro';
import { useRef, useState } from 'react';
import { v4 } from 'uuid';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getCorgiActivityTitle } from '@/corgi-crm/forms/utils/getCorgiActivityTitle';

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
  // Synchronous lock prevents double submission before React commits state.
  // oxlint-disable-next-line twenty/no-state-useref
  const submitting = useRef(false);
  const { record: company } = useFindOneRecord({
    objectNameSingular: 'company',
    objectRecordId: companyId,
    recordGqlFields: { id: true, name: true },
  });
  const { objectMetadataItems } = useObjectMetadataItems();
  const activityMetadata = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'outreachActivity',
  );

  const currentWorkspaceMemberId = currentWorkspaceMember?.id;

  const {
    records: wholesalerRecords,
    loading: isWholesalerLoading,
    error: wholesalerError,
  } = useFindManyRecords({
    objectNameSingular: 'wholesaler',
    filter: { workspaceMemberId: { eq: currentWorkspaceMemberId ?? '' } },
    recordGqlFields: { id: true, workspaceMemberId: true },
    limit: 2,
    skip: !currentWorkspaceMemberId,
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
    (wholesaler) => wholesaler.workspaceMemberId === currentWorkspaceMemberId,
  );

  let ownershipError: string | null = null;

  if (!currentWorkspaceMemberId) {
    ownershipError = t`Your workspace member identity is unavailable.`;
  } else if (wholesalerError) {
    ownershipError = t`Your wholesaler profile could not be verified.`;
  } else if (!isWholesalerLoading && matchingWholesalerRecords.length === 0) {
    ownershipError = t`No wholesaler profile is linked to your workspace member.`;
  } else if (!isWholesalerLoading && matchingWholesalerRecords.length > 1) {
    ownershipError = t`More than one wholesaler profile is linked to your workspace member.`;
  }

  const submitActivity = async (
    values: QuickLogActivityFormValues,
  ): Promise<boolean> => {
    if (submitting.current) return false;
    const wholesalerId = matchingWholesalerRecords[0]?.id;

    if (ownershipError || !wholesalerId) {
      enqueueErrorSnackBar({
        message: ownershipError ?? t`Your wholesaler profile is unavailable.`,
      });
      return false;
    }

    const activityTypeField = activityMetadata?.fields.find(
      ({ name }) => name === 'activityType',
    );
    const selectedOption = activityTypeField?.options?.find(
      ({ value }) => value.toLowerCase() === values.activityType.toLowerCase(),
    );
    if (activityTypeField?.type === 'SELECT' && !selectedOption) {
      enqueueErrorSnackBar({
        message: t`This activity type is unavailable. Reload and try again.`,
      });
      return false;
    }
    if (
      values.contactId &&
      !peopleRecords.some(({ id }) => id === values.contactId)
    ) {
      enqueueErrorSnackBar({ message: t`Choose a contact from this company.` });
      return false;
    }
    const occurredAt = new Date().toISOString();
    submitting.current = true;
    setIsSubmitting(true);

    try {
      await createOneRecord({
        name: getCorgiActivityTitle({
          activityType: selectedOption?.value ?? values.activityType,
          companyId,
          companyName: company?.name,
          occurredAt,
        }),
        companyId,
        wholesalerId,
        activityType: selectedOption?.value ?? values.activityType,
        outcome: values.outcome,
        occurredAt,
        notes: values.notes.trim() || null,
        ...(values.contactId ? { contactId: values.contactId } : {}),
        ...(values.followUpDate
          ? {
              followUpDate: values.followUpDate,
              ...(activityMetadata?.fields.some(
                ({ name }) => name === 'followUpRequestKey',
              )
                ? { followUpRequestKey: v4() }
                : {}),
            }
          : {}),
      });

      enqueueSuccessSnackBar({ message: t`Activity logged.` });
      return true;
    } catch {
      enqueueErrorSnackBar({ message: t`Could not log the activity.` });
      return false;
    } finally {
      submitting.current = false;
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
