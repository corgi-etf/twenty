import { getCorgiActivityTitle } from '@/corgi-crm/forms/utils/getCorgiActivityTitle';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { CorgiAccentPalettePicker } from '@/corgi-crm/settings/components/CorgiAccentPalettePicker';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { createPortal } from 'react-dom';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { v4, v5 } from 'uuid';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  corgiCreateDialogsState,
  type CorgiCreateDialog,
} from '@/corgi-crm/forms/states/corgiCreateDialogsState';
import {
  CORGI_CREATE_FIELDS,
  CORGI_REQUIRED_CREATE_FIELDS,
  getCorgiCreateError,
  getCorgiRecordLabel,
  getCorgiRelationshipError,
} from '@/corgi-crm/forms/utils/corgiRecordDraft';
import { CorgiDraftField } from '@/corgi-crm/forms/components/CorgiDraftField';
import {
  StyledCorgiFormButton,
  StyledCorgiFormGroup,
  StyledCorgiFormHint,
  StyledCorgiFormLegend,
  StyledCorgiFormNotice,
  StyledCorgiFormOption,
  StyledCorgiFormOptionGrid,
  StyledCorgiFormPrimaryButton,
  StyledCorgiFormTextButton,
} from '@/corgi-crm/forms/components/CorgiFormStyles';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { CORGI_FIRST_TOUCH_ACTIONS } from '@/corgi-crm/forms/constants/corgiFirstTouch';
import { CORGI_FOLLOW_UP_TICK } from '@/corgi-crm/forms/constants/corgiFollowUpTick';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { stopCorgiInputKeyCapture } from '@/corgi-crm/utils/stopCorgiInputKeyCapture';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const StyledDialog = styled.dialog`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  overflow: hidden;
  padding: 0;
  width: min(560px, calc(100vw - 32px));
  &[open] {
    animation: corgi-dialog-enter 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  &::backdrop {
    background: ${themeCssVariables.background.overlayPrimary};
  }
  &[open]::backdrop {
    animation: corgi-dialog-backdrop-enter 180ms ease-out;
  }
  @keyframes corgi-dialog-enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
  @keyframes corgi-dialog-backdrop-enter {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &[open],
    &[open]::backdrop {
      animation: none;
    }
  }
  input:not([type='checkbox']),
  select,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    font-size: ${themeCssVariables.font.size.md};
    min-height: 34px;
    padding: 7px 10px;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
    width: 100%;
  }
  input::placeholder,
  textarea::placeholder {
    color: ${themeCssVariables.font.color.light};
  }
  input:not([type='checkbox']):hover,
  select:hover,
  textarea:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }
  input:not([type='checkbox']):focus,
  select:focus,
  textarea:focus {
    border-color: ${themeCssVariables.color.blue};
    box-shadow: 0 0 0 3px ${themeCssVariables.accent.tertiary};
    outline: none;
  }
  textarea {
    line-height: 1.45;
    min-height: 88px;
    resize: vertical;
  }
  select[multiple] {
    padding: 4px;
  }
  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.blue};
    cursor: pointer;
    flex-shrink: 0;
    height: 16px;
    margin: 0;
    width: 16px;
  }
  details > summary {
    align-items: center;
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    display: inline-flex;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
    gap: 6px;
    list-style: none;
    padding: 4px 0;
    transition: color 120ms ease;
    user-select: none;
  }
  details > summary::-webkit-details-marker {
    display: none;
  }
  details > summary::before {
    content: '';
    border-bottom: 4px solid transparent;
    border-left: 5px solid currentColor;
    border-top: 4px solid transparent;
    transition: transform 120ms ease;
  }
  details[open] > summary::before {
    transform: rotate(90deg);
  }
  details > summary:hover {
    color: ${themeCssVariables.font.color.primary};
  }
  details > summary:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 2px;
  }
  details > :not(summary) {
    margin-top: 16px;
  }
`;

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  max-height: min(85vh, calc(100dvh - 32px));
`;

const StyledHeader = styled.header`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 24px 14px;
  h2 {
    font-size: ${themeCssVariables.font.size.lg};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    line-height: 1.3;
    margin: 0;
  }
`;

const StyledBody = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 24px 24px;
`;

const StyledMoreDetails = styled.details`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding-top: 14px;
`;

const StyledOwnerList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
  &:empty {
    display: none;
  }
  li {
    align-items: center;
    background: ${themeCssVariables.background.transparent.lighter};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: ${themeCssVariables.border.radius.sm};
    display: flex;
    gap: 8px;
    justify-content: space-between;
    padding: 2px 4px 2px 10px;
  }
`;

const StyledFooter = styled.footer`
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 24px;
`;

const StyledFooterActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

type CorgiCreateRecordDialogProps = {
  dialog: CorgiCreateDialog;
  active: boolean;
  close: (record?: ObjectRecord) => void;
  persistOwners?: (companyId: string, owners: string[]) => Promise<void>;
};
export const CorgiCreateRecordDialog = ({
  dialog,
  active,
  close,
  persistOwners,
}: CorgiCreateRecordDialogProps) => {
  const { t } = useLingui();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Synchronous submission ledger: survives renders and prevents duplicate writes.
  // oxlint-disable-next-line twenty/no-state-useref
  const saving = useRef(false);
  // Synchronous submission ledger: survives renders and prevents duplicate writes.
  // oxlint-disable-next-line twenty/no-state-useref
  const savedRecord = useRef<ObjectRecord | undefined>(dialog.savedRecord);
  const [, setCorgiCreateDialogs] = useAtomState(corgiCreateDialogsState);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [owners, setOwners] = useState<ObjectRecord[]>(dialog.owners ?? []);
  const [firstTouch, setFirstTouch] = useState<Record<string, boolean>>({});
  // Synchronous submission ledger: survives renders and prevents duplicate writes.
  // oxlint-disable-next-line twenty/no-state-useref
  const defaultOwnerApplied = useRef(Boolean(dialog.draft));
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { records: ownProfiles } = useFindManyRecords({
    objectNameSingular: 'wholesaler',
    filter: { workspaceMemberId: { eq: currentWorkspaceMember?.id } },
    skip: !currentWorkspaceMember?.id,
    limit: 2,
  });
  const [relations, setRelations] = useState<
    Record<string, ObjectRecord | undefined>
  >(dialog.relations ?? {});
  const [draft, setDraft] = useState<Partial<ObjectRecord>>(
    () =>
      dialog.draft ?? {
        id: v4(),
        ...(dialog.objectNameSingular === 'outreachActivity'
          ? { occurredAt: new Date().toISOString() }
          : {}),
        ...(dialog.objectNameSingular === 'meetingBooking'
          ? { status: 'BOOKED' }
          : {}),
        ...dialog.initialValues,
      },
  );
  useEffect(() => {
    setCorgiCreateDialogs((dialogs) =>
      dialogs.map((entry) =>
        entry.id === dialog.id
          ? {
              ...entry,
              draft,
              owners,
              relations,
              savedRecord: savedRecord.current,
            }
          : entry,
      ),
    );
  }, [draft, owners, relations, dialog.id, setCorgiCreateDialogs]);
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: dialog.objectNameSingular,
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: dialog.objectNameSingular,
  });
  const { createOneRecord: createOneActivity } = useCreateOneRecord({
    objectNameSingular: 'outreachActivity',
  });
  const isCompany = dialog.objectNameSingular === 'company';
  const [duplicateSearch] = useDebounce(
    isCompany && typeof draft.name === 'string' ? draft.name.trim() : '',
    250,
  );
  const { records: duplicates } = useFindManyRecords({
    objectNameSingular: dialog.objectNameSingular,
    limit: 3,
    skip: !isCompany || duplicateSearch.length < 3,
    filter: { name: { ilike: duplicateSearch } },
  });
  useEffect(() => {
    const element = dialogRef.current;
    if (active && element && !element.open) element.showModal();
    if (!active) element?.close();
  }, [active]);
  useEffect(() => {
    if (defaultOwnerApplied.current || ownProfiles.length !== 1) return;
    defaultOwnerApplied.current = true;
    const owner = ownProfiles[0];
    if (isCompany)
      setOwners((previous) => (previous.length ? previous : [owner]));
    setDraft((previous) => ({
      ...(dialog.objectNameSingular === 'meetingBooking' ||
      dialog.objectNameSingular === 'outreachActivity'
        ? { wholesalerId: owner.id }
        : {}),
      ...(dialog.objectNameSingular === 'companyAllocation'
        ? { externalWholesalerId: owner.id }
        : {}),
      ...previous,
    }));
  }, [ownProfiles, isCompany, dialog.objectNameSingular]);
  const essentials = CORGI_CREATE_FIELDS[dialog.objectNameSingular] ?? ['name'];
  const requiredFields =
    CORGI_REQUIRED_CREATE_FIELDS[dialog.objectNameSingular] ?? [];
  const editableFields = objectMetadataItem.fields.filter(
    (field) =>
      field.isActive &&
      !field.isSystem &&
      field.isUIEditable &&
      permissions.restrictedFields?.[field.id]?.canRead !== false &&
      permissions.restrictedFields?.[field.id]?.canUpdate !== false &&
      ![
        'stateRegion',
        'postalCode',
        'accountOwner',
        'historicalOwner',
        'bookedAt',
        'loggedAt',
        'nameManaged',
        'followUpRequestKey',
        'bookingValidationMessage',
      ].includes(field.name),
  );
  const renderField = (field: (typeof editableFields)[number]) => {
    const key = field.type === 'RELATION' ? `${field.name}Id` : field.name;
    return (
      <CorgiDraftField
        key={field.id}
        field={field}
        value={draft[key]}
        companyId={draft.companyId}
        isRequired={requiredFields.includes(field.name)}
        onChange={(value, record) => {
          setDraft((previous) => ({ ...previous, [key]: value }));
          if (field.type === 'RELATION') {
            setRelations((previous) => ({ ...previous, [field.name]: record }));
            if (record?.company?.id && !draft.companyId)
              setDraft((previous) => ({
                ...previous,
                companyId: record.company.id,
              }));
          }
        }}
      />
    );
  };
  // Logged after the firm exists so each activity can reference it. One
  // activity per tick, credited to the first owner, which is the person doing
  // the calling. A failure here must not lose the firm that was already saved.
  const logFirstTouch = async (company: ObjectRecord) => {
    const ticked = CORGI_FIRST_TOUCH_ACTIONS.filter(
      ({ key }) => firstTouch[key],
    );
    const needsFollowUp = firstTouch[CORGI_FOLLOW_UP_TICK.key] === true;

    if (ticked.length === 0 && !needsFollowUp) return;

    const occurredAt = new Date().toISOString();
    const companyName = getCorgiRecordLabel(company);
    const wholesalerId = owners[0]?.id;
    const followUpDate = needsFollowUp ? occurredAt : undefined;
    // A follow-up with nothing done yet is still worth recording, so it becomes
    // one Other activity rather than being silently dropped.
    const entries = ticked.length
      ? ticked
      : [{ key: 'needsFollowUp', activityType: 'OTHER', outcome: undefined }];

    for (const entry of entries) {
      await createOneActivity({
        activityType: entry.activityType,
        companyId: company.id,
        ...(wholesalerId ? { wholesalerId } : {}),
        occurredAt,
        ...(followUpDate ? { followUpDate, followUpRequestKey: v4() } : {}),
        ...('outcome' in entry && entry.outcome
          ? { outcome: t(entry.outcome) }
          : {}),
        name: getCorgiActivityTitle({
          activityType: entry.activityType,
          companyId: company.id,
          companyName,
          occurredAt,
        }),
      });
    }
  };

  const handleSave = async () => {
    if (saving.current) return;
    const validationError =
      getCorgiCreateError(dialog.objectNameSingular, draft) ??
      getCorgiRelationshipError(draft.companyId, relations.contact) ??
      getCorgiRelationshipError(draft.companyId, relations.meeting);
    if (validationError) {
      setError(validationError);
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setError(undefined);
    try {
      const writableNames = new Set(
        objectMetadataItem.fields.map((field) =>
          field.type === 'RELATION' ? `${field.name}Id` : field.name,
        ),
      );
      // Related profile actions share context across several record types.
      // Send only fields belonging to the target object's current schema.
      const input = Object.fromEntries(
        Object.entries(draft).filter(
          ([name]) => name === 'id' || writableNames.has(name),
        ),
      );
      if (isCompany && owners.length) {
        input.historicalOwnerId = owners[0].id;
        if (owners[0].workspaceMember?.id)
          input.accountOwnerId = owners[0].workspaceMember.id;
      }
      if (
        dialog.objectNameSingular === 'outreachActivity' &&
        input.followUpDate &&
        writableNames.has('followUpRequestKey')
      )
        input.followUpRequestKey = v4();
      if (
        !input.name &&
        ['outreachActivity', 'meetingBooking'].includes(
          dialog.objectNameSingular,
        )
      ) {
        input.name = getCorgiActivityTitle({
          activityType:
            dialog.objectNameSingular === 'meetingBooking'
              ? 'MEETING'
              : input.activityType,
          companyId: input.companyId,
          companyName: relations.company
            ? getCorgiRecordLabel(relations.company)
            : undefined,
          occurredAt:
            input.occurredAt ?? input.scheduledAt ?? new Date().toISOString(),
        });
      }
      for (const field of objectMetadataItem.fields) {
        if (
          permissions.restrictedFields?.[field.id]?.canRead === false ||
          permissions.restrictedFields?.[field.id]?.canUpdate === false
        ) {
          delete input[field.name];
          if (field.type === 'RELATION') delete input[`${field.name}Id`];
        }
      }
      const record = savedRecord.current ?? (await createOneRecord(input));
      savedRecord.current = record;
      setCorgiCreateDialogs((dialogs) =>
        dialogs.map((entry) =>
          entry.id === dialog.id ? { ...entry, savedRecord: record } : entry,
        ),
      );
      if (persistOwners)
        await persistOwners(
          record.id,
          owners.map(({ id }) => id),
        );
      if (isCompany) await logFirstTouch(record);
      await dialog.onCreated?.(record);
      close(record);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Save failed. Your draft is preserved.`,
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  return createPortal(
    <StyledDialog
      ref={dialogRef}
      aria-label={t`Create ${objectMetadataItem.labelSingular}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!isSaving) close();
      }}
    >
      <StyledForm
        onKeyDown={stopCorgiInputKeyCapture}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <StyledHeader>
          <h2>
            <Trans>Create {objectMetadataItem.labelSingular}</Trans>
          </h2>
          {requiredFields.length > 0 && (
            <StyledCorgiFormHint>
              <Trans>Fields marked * are required.</Trans>
            </StyledCorgiFormHint>
          )}
        </StyledHeader>
        <StyledBody>
          {!permissions.canUpdateObjectRecords && (
            <StyledCorgiFormNotice role="alert">
              <Trans>You cannot create this record.</Trans>
            </StyledCorgiFormNotice>
          )}
          {duplicates.length > 0 && (
            <StyledCorgiFormNotice role="status">
              <Trans>Similar company already exists:</Trans>{' '}
              {duplicates.map(getCorgiRecordLabel).join(', ')}.{' '}
              <Trans>Check existing records before saving.</Trans>
            </StyledCorgiFormNotice>
          )}
          {essentials.flatMap((name) => {
            const field = editableFields.find(
              (candidate) => candidate.name === name,
            );
            return field ? [renderField(field)] : [];
          })}
          {isCompany && (
            <StyledCorgiFormGroup onKeyDown={stopCorgiInputKeyCapture}>
              <StyledCorgiFormLegend>
                <Trans>What happened</Trans>
              </StyledCorgiFormLegend>
              <StyledCorgiFormOptionGrid>
                {[...CORGI_FIRST_TOUCH_ACTIONS, CORGI_FOLLOW_UP_TICK].map(
                  ({ key, label }) => (
                    <StyledCorgiFormOption key={key}>
                      <input
                        type="checkbox"
                        checked={firstTouch[key] === true}
                        onChange={(event) =>
                          setFirstTouch((previous) => ({
                            ...previous,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      {t(label)}
                    </StyledCorgiFormOption>
                  ),
                )}
              </StyledCorgiFormOptionGrid>
            </StyledCorgiFormGroup>
          )}
          {persistOwners && (
            <>
              <CorgiRelationPicker
                objectNameSingular="wholesaler"
                openProfileInNewTab
                keepOpenOnSelect
                label={t`Owners`}
                onChange={(owner) => {
                  if (owner)
                    setOwners((previous) =>
                      previous.some(({ id }) => id === owner.id)
                        ? previous
                        : [...previous, owner],
                    );
                }}
              />
              <StyledOwnerList>
                {owners.map((owner) => (
                  <li key={owner.id}>
                    {getCorgiRecordLabel(owner)}{' '}
                    <StyledCorgiFormTextButton
                      type="button"
                      onClick={() =>
                        setOwners((previous) =>
                          previous.filter(({ id }) => id !== owner.id),
                        )
                      }
                    >
                      <Trans>Remove link</Trans>
                    </StyledCorgiFormTextButton>
                  </li>
                ))}
              </StyledOwnerList>
            </>
          )}
          <StyledMoreDetails>
            <summary>
              <Trans>More details</Trans>
            </summary>
            {editableFields
              .filter(
                ({ name, type, relation }) =>
                  !essentials.includes(name) &&
                  (type !== 'RELATION' || relation?.type === 'MANY_TO_ONE'),
              )
              .map(renderField)}
          </StyledMoreDetails>
        </StyledBody>
        <StyledFooter>
          {error && (
            <StyledCorgiFormNotice role="alert">{error}</StyledCorgiFormNotice>
          )}
          <StyledFooterActions>
            <StyledCorgiFormButton
              type="button"
              disabled={isSaving}
              onClick={() => close()}
            >
              <Trans>Cancel</Trans>
            </StyledCorgiFormButton>
            <StyledCorgiFormPrimaryButton
              type="submit"
              aria-busy={isSaving}
              disabled={isSaving || !permissions.canUpdateObjectRecords}
            >
              {isSaving ? t`Saving…` : t`Save`}
            </StyledCorgiFormPrimaryButton>
          </StyledFooterActions>
        </StyledFooter>
      </StyledForm>
    </StyledDialog>,
    document.body,
  );
};

type CorgiCompanyCreateDialogProps = CorgiCreateRecordDialogProps;

const CorgiCompanyCreateDialog = (props: CorgiCompanyCreateDialogProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'companyOwnership',
  });
  // Synchronous submission ledger: survives renders and prevents duplicate writes.
  // oxlint-disable-next-line twenty/no-state-useref
  const savedOwners = useRef(new Set<string>());
  const { refetch: readOwnership } = useFindOneRecord({
    objectNameSingular: 'companyOwnership',
    objectRecordId: undefined,
    skip: true,
    recordGqlFields: { id: true, companyId: true, wholesalerId: true },
  });
  return (
    <CorgiCreateRecordDialog
      dialog={props.dialog}
      active={props.active}
      close={props.close}
      persistOwners={async (companyId, owners) => {
        for (const [index, wholesalerId] of owners.entries()) {
          if (savedOwners.current.has(wholesalerId)) continue;
          const id = v5(`${companyId}:${wholesalerId}`, v5.URL);
          try {
            await createOneRecord({
              id,
              companyId,
              wholesalerId,
              isPrimary: index === 0,
            });
          } catch (failure) {
            // A lost response can hide a committed create. Verify its identity
            // before retrying so a unique constraint does not strand the form.
            const result = await readOwnership({ objectRecordId: id });
            const existing = result.data?.companyOwnership;
            if (
              existing?.id !== id ||
              existing.companyId !== companyId ||
              existing.wholesalerId !== wholesalerId
            )
              throw failure;
          }
          savedOwners.current.add(wholesalerId);
        }
      }}
    />
  );
};

export const CorgiCreateRecordDialogHost = () => {
  const [corgiCreateDialogs, setCorgiCreateDialogs] = useAtomState(
    corgiCreateDialogsState,
  );
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasOwners = objectMetadataItems.some(
    ({ nameSingular }) => nameSingular === 'companyOwnership',
  );
  return (
    <>
      <CorgiAccentPalettePicker showPicker={false} />
      {corgiCreateDialogs.map((dialog, index) => {
        const props = {
          dialog,
          active: index === corgiCreateDialogs.length - 1,
          close: (record?: ObjectRecord) => {
            setCorgiCreateDialogs((previous) =>
              previous.filter(({ id }) => id !== dialog.id),
            );
            dialog.resolve(record);
            requestAnimationFrame(() => dialog.trigger?.focus());
          },
        };
        return dialog.objectNameSingular === 'company' && hasOwners ? (
          <CorgiCompanyCreateDialog
            key={dialog.id}
            dialog={props.dialog}
            active={props.active}
            close={props.close}
          />
        ) : (
          <CorgiCreateRecordDialog
            key={dialog.id}
            dialog={props.dialog}
            active={props.active}
            close={props.close}
          />
        );
      })}
    </>
  );
};
