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
  getCorgiCreateError,
  getCorgiRecordLabel,
  getCorgiRelationshipError,
} from '@/corgi-crm/forms/utils/corgiRecordDraft';
import { CorgiDraftField } from '@/corgi-crm/forms/components/CorgiDraftField';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
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
  max-height: 85vh;
  padding: 24px;
  width: min(540px, calc(100vw - 48px));
  &::backdrop {
    background: ${themeCssVariables.background.overlayPrimary};
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  label {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  input:not([type='checkbox']),
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 4px;
    box-sizing: border-box;
    color: inherit;
    padding: 8px;
    width: 100%;
  }
  fieldset {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  button {
    cursor: pointer;
    padding: 6px 10px;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid ${themeCssVariables.accent.primary};
  }
  footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  ul {
    list-style: none;
    max-height: 200px;
    overflow: auto;
    padding: 0;
  }
  li button {
    text-align: left;
    width: 100%;
  }
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
      <form
        onKeyDown={stopCorgiInputKeyCapture}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <h2>
          <Trans>Create {objectMetadataItem.labelSingular}</Trans>
        </h2>
        {error && <p role="alert">{error}</p>}
        {!permissions.canUpdateObjectRecords && (
          <p role="alert">
            <Trans>You cannot create this record.</Trans>
          </p>
        )}
        {duplicates.length > 0 && (
          <p role="status">
            <Trans>Similar company already exists:</Trans>{' '}
            {duplicates.map(getCorgiRecordLabel).join(', ')}.{' '}
            <Trans>Check existing records before saving.</Trans>
          </p>
        )}
        {essentials.flatMap((name) => {
          const field = editableFields.find(
            (candidate) => candidate.name === name,
          );
          return field ? [renderField(field)] : [];
        })}
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
            <ul>
              {owners.map((owner) => (
                <li key={owner.id}>
                  {getCorgiRecordLabel(owner)}{' '}
                  <button
                    type="button"
                    onClick={() =>
                      setOwners((previous) =>
                        previous.filter(({ id }) => id !== owner.id),
                      )
                    }
                  >
                    <Trans>Remove link</Trans>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <details>
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
        </details>
        <footer>
          <button type="button" disabled={isSaving} onClick={() => close()}>
            <Trans>Cancel</Trans>
          </button>
          <button
            type="submit"
            disabled={isSaving || !permissions.canUpdateObjectRecords}
          >
            {isSaving ? t`Saving…` : t`Save`}
          </button>
        </footer>
      </form>
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
