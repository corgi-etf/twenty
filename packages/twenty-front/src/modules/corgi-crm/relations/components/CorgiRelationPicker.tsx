import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { Link } from 'react-router-dom';
import { getLinkToShowPage } from '@/object-metadata/utils/getLinkToShowPage';
import { Trans, useLingui } from '@lingui/react/macro';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { RecordChip } from '@/object-record/components/RecordChip';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useCorgiCreateRecordDialog } from '@/corgi-crm/forms/hooks/useCorgiCreateRecordDialog';
import { stopCorgiInputKeyCapture } from '@/corgi-crm/utils/stopCorgiInputKeyCapture';
import {
  getCorgiRecordLabel,
  CORGI_CREATE_FIELDS,
} from '@/corgi-crm/forms/utils/corgiRecordDraft';

type CorgiRelationPickerProps = {
  objectNameSingular: string;
  label: string;
  value?: string;
  companyId?: string;
  openProfileInNewTab?: boolean;
  keepOpenOnSelect?: boolean;
  onChange: (record: ObjectRecord | undefined) => void;
};

export const CorgiRelationPicker = ({
  objectNameSingular,
  label,
  value,
  companyId,
  openProfileInNewTab = false,
  keepOpenOnSelect = false,
  onChange,
}: CorgiRelationPickerProps) => {
  const { t } = useLingui();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const [isOpen, setIsOpen] = useState(!value);
  const [searchAll, setSearchAll] = useState(false);
  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });
  const { openCreateRecord } = useCorgiCreateRecordDialog();
  const nameField = objectMetadataItem.fields.find(
    ({ id }) => id === objectMetadataItem.labelIdentifierFieldMetadataId,
  );
  const searchFilter = !debouncedSearch
    ? {}
    : nameField?.type === 'FULL_NAME'
      ? {
          or: [
            { name: { firstName: { ilike: `%${debouncedSearch}%` } } },
            { name: { lastName: { ilike: `%${debouncedSearch}%` } } },
          ],
        }
      : { [nameField?.name ?? 'name']: { ilike: `%${debouncedSearch}%` } };
  const canScope =
    Boolean(companyId) &&
    objectMetadataItem.fields.some(({ name }) => name === 'company');
  const { records, loading, error, hasNextPage, fetchMoreRecords } =
    useFindManyRecords({
      objectNameSingular,
      limit: 15,
      skip: !isOpen,
      filter:
        canScope && !searchAll
          ? { and: [searchFilter, { companyId: { eq: companyId } }] }
          : searchFilter,
    });
  const { record: selectedRecord } = useFindOneRecord({
    objectNameSingular,
    objectRecordId: value,
    skip: !value,
  });
  // The latest callback avoids rehydrating parent drafts on every parent render.
  // oxlint-disable-next-line twenty/no-state-useref
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (selectedRecord) onChangeRef.current(selectedRecord);
    // Hydrate only when the selected identity or company changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecord?.id, selectedRecord?.company?.id]);

  const select = (record: ObjectRecord) => {
    onChange(record);
    setIsOpen(keepOpenOnSelect);
    setSearch('');
  };
  return (
    <fieldset onKeyDown={stopCorgiInputKeyCapture}>
      <legend>{label}</legend>
      {value && (
        <div>
          {selectedRecord ? (
            openProfileInNewTab ? (
              <Link
                to={getLinkToShowPage(objectNameSingular, selectedRecord)}
                target="_blank"
                rel="noopener noreferrer"
                title={t`Open profile in a new tab`}
              >
                {getCorgiRecordLabel(selectedRecord)}
              </Link>
            ) : (
              <RecordChip
                objectNameSingular={objectNameSingular}
                record={selectedRecord}
              />
            )
          ) : (
            <span>
              <Trans>Record unavailable</Trans>
            </span>
          )}{' '}
          <button type="button" onClick={() => setIsOpen(!isOpen)}>
            <Trans>Change</Trans>
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setIsOpen(true);
            }}
          >
            <Trans>Remove link</Trans>
          </button>
        </div>
      )}
      {isOpen && (
        <>
          <input
            aria-label={t`Search ${label}`}
            placeholder={t`Search existing`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {canScope && (
            <label>
              <input
                type="checkbox"
                checked={searchAll}
                onChange={(event) => setSearchAll(event.target.checked)}
              />
              <Trans>Search all companies</Trans>
            </label>
          )}
          {loading && (
            <p role="status">
              <Trans>Searching…</Trans>
            </p>
          )}
          {error && (
            <p role="alert">
              <Trans>Search unavailable. Try again.</Trans>
            </p>
          )}
          <ul>
            {records.map((record) => (
              <li key={record.id}>
                <button type="button" onClick={() => select(record)}>
                  {getCorgiRecordLabel(record)}
                  {record.company?.name ? ` · ${record.company.name}` : ''}
                  {record.address?.addressCity
                    ? ` · ${record.address.addressCity}, ${record.address.addressState ?? ''}`
                    : ''}
                  {record.territory ? ` · ${record.territory}` : ''}
                  {record.activeClient === true ? ` · ${t`Active client`}` : ''}
                </button>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <button type="button" onClick={() => void fetchMoreRecords()}>
              <Trans>Load more</Trans>
            </button>
          )}
          {CORGI_CREATE_FIELDS[objectNameSingular] && (
            <button
              type="button"
              onClick={() =>
                void openCreateRecord({
                  objectNameSingular,
                  initialValues: {
                    ...(companyId && canScope ? { companyId } : {}),
                    ...(search && nameField?.type !== 'FULL_NAME'
                      ? { [nameField?.name ?? 'name']: search }
                      : {}),
                  },
                  onCreated: select,
                })
              }
            >
              <Trans>Create new</Trans>
            </button>
          )}
        </>
      )}
    </fieldset>
  );
};
