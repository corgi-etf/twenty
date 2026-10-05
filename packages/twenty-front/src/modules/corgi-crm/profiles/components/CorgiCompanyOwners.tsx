import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useUpdateManyRecordsMutation } from '@/object-record/hooks/useUpdateManyRecordsMutation';
import { useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { v5 } from 'uuid';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useRestoreManyRecords } from '@/object-record/hooks/useRestoreManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { RecordChip } from '@/object-record/components/RecordChip';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';

export const CorgiCompanyOwners = ({ companyId }: { companyId: string }) => {
  const { t } = useLingui();
  const apolloCoreClient = useApolloCoreClient();
  const { updateManyRecordsMutation } = useUpdateManyRecordsMutation({
    objectNameSingular: 'companyOwnership',
  });
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'companyOwnership',
  });
  const permission = useObjectPermissionsForObject(objectMetadataItem.id);
  const { records, loading, error, hasNextPage, fetchMoreRecords, refetch } =
    useFindManyRecords({
      objectNameSingular: 'companyOwnership',
      filter: { companyId: { eq: companyId } },
      withSoftDeleted: true,
      limit: 50,
    });
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'companyOwnership',
  });
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: 'companyOwnership',
  });
  const { restoreManyRecords } = useRestoreManyRecords({
    objectNameSingular: 'companyOwnership',
  });
  const [saveError, setSaveError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  // Synchronous lock prevents double submission before React commits state.
  // oxlint-disable-next-line twenty/no-state-useref
  const saving = useRef(false);
  const updateLink = async (operation: () => Promise<unknown>) => {
    if (saving.current) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      await operation();
      await refetch();
    } catch (failure) {
      setSaveError(
        failure instanceof Error
          ? failure.message
          : t`Could not update owners.`,
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  return (
    <section>
      <h3>
        <Trans>Owners</Trans>
      </h3>
      {loading && (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      )}
      {(error || saveError) && (
        <p role="alert">{saveError ?? t`Owners unavailable`}</p>
      )}
      <ul>
        {records
          .filter(({ deletedAt }) => !deletedAt)
          .map((ownership) => (
            <li key={ownership.id}>
              {ownership.wholesaler ? (
                <RecordChip
          objectNameSingular="wholesaler"
          keepOpenOnSelect
                  record={ownership.wholesaler}
                />
              ) : (
                <span>
                  <Trans>Owner unavailable</Trans>
                </span>
              )}
              {ownership.isPrimary && (
                <span>
                  <Trans>Primary</Trans>
                </span>
              )}
              {permission.canSoftDeleteObjectRecords && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    void updateLink(() => deleteOneRecord(ownership.id))
                  }
                >
                  <Trans>Remove link</Trans>
                </button>
              )}
            </li>
          ))}
      </ul>
      {hasNextPage && (
        <button type="button" onClick={() => void fetchMoreRecords()}>
          <Trans>Load more</Trans>
        </button>
      )}
      {permission.canUpdateObjectRecords &&
        !isSaving &&
        !loading &&
        !error &&
        !hasNextPage && (
          <CorgiRelationPicker
            objectNameSingular="wholesaler"
            label={t`Link owner`}
            onChange={(owner) => {
              if (!owner) return;
              const existing = records.find(
                (ownership) =>
                  (ownership.wholesalerId ?? ownership.wholesaler?.id) ===
                  owner.id,
              );
              if (existing && !existing.deletedAt) return;
              void updateLink(async () => {
                const isPrimary = !records.some(
                  (ownership) => ownership.isPrimary && !ownership.deletedAt,
                );
                if (existing) {
                  // Correct the tombstone before restoring it, so the old primary
                  // flag cannot temporarily create two active primary owners.
                  const response = await apolloCoreClient.mutate<{
                    updateCompanyOwnerships: { id: string }[];
                  }>({
                    mutation: updateManyRecordsMutation,
                    variables: {
                      filter: {
                        and: [
                          { id: { eq: existing.id } },
                          { companyId: { eq: companyId } },
                          { deletedAt: { is: 'NOT_NULL' } },
                          ...(existing.updatedAt
                            ? [{ updatedAt: { eq: existing.updatedAt } }]
                            : []),
                        ],
                      },
                      data: { isPrimary },
                    },
                  });
                  if (
                    response.data?.updateCompanyOwnerships.length !== 1 ||
                    response.data.updateCompanyOwnerships[0].id !== existing.id
                  )
                    throw new Error(
                      t`This owner link changed. Refresh and try again.`,
                    );
                  await restoreManyRecords({ idsToRestore: [existing.id] });
                } else {
                  await createOneRecord({
                    id: v5(`${companyId}:${owner.id}`, v5.URL),
                    companyId,
                    wholesalerId: owner.id,
                    isPrimary,
                  });
                }
              });
            }}
          />
        )}
    </section>
  );
};
