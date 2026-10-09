import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { Link } from 'react-router-dom';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
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
import {
  StyledCorgiFormButton,
  StyledCorgiFormCheckbox,
  StyledCorgiFormGroup,
  StyledCorgiFormHint,
  StyledCorgiFormLegend,
  StyledCorgiFormNotice,
  StyledCorgiFormTextButton,
} from '@/corgi-crm/forms/components/CorgiFormStyles';

const StyledSelection = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-height: 36px;
  padding: 2px 4px 2px 10px;
  > a {
    color: ${themeCssVariables.font.color.primary};
    flex: 1 1 auto;
    font-weight: ${themeCssVariables.font.weight.medium};
    min-width: 0;
    overflow: hidden;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  > a:hover {
    text-decoration: underline;
  }
`;

const StyledUnavailable = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 1 1 auto;
`;

const StyledResults = styled.ul`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: 2px;
  list-style: none;
  margin: 0;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  &:empty {
    display: none;
  }
`;

const StyledResult = styled.button`
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.xs};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.md};
  padding: 8px 10px;
  text-align: left;
  transition: background-color 120ms ease;
  width: 100%;
  &:hover,
  &:focus-visible {
    background: ${themeCssVariables.background.transparent.medium};
    outline: none;
  }
`;

const StyledPickerActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

type CorgiRelationPickerProps = {
  objectNameSingular: string;
  label: string;
  value?: string;
  companyId?: string;
  openProfileInNewTab?: boolean;
  keepOpenOnSelect?: boolean;
  isRequired?: boolean;
  onChange: (record: ObjectRecord | undefined) => void;
};

export const CorgiRelationPicker = ({
  objectNameSingular,
  label,
  value,
  companyId,
  openProfileInNewTab = false,
  keepOpenOnSelect = false,
  isRequired = false,
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
    <StyledCorgiFormGroup onKeyDown={stopCorgiInputKeyCapture}>
      <StyledCorgiFormLegend data-required={isRequired}>
        {label}
      </StyledCorgiFormLegend>
      {value && (
        <StyledSelection>
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
            <StyledUnavailable>
              <Trans>Record unavailable</Trans>
            </StyledUnavailable>
          )}{' '}
          <StyledCorgiFormTextButton
            type="button"
            onClick={() => setIsOpen(!isOpen)}
          >
            <Trans>Change</Trans>
          </StyledCorgiFormTextButton>{' '}
          <StyledCorgiFormTextButton
            type="button"
            onClick={() => {
              onChange(undefined);
              setIsOpen(true);
            }}
          >
            <Trans>Remove link</Trans>
          </StyledCorgiFormTextButton>
        </StyledSelection>
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
            <StyledCorgiFormCheckbox>
              <input
                type="checkbox"
                checked={searchAll}
                onChange={(event) => setSearchAll(event.target.checked)}
              />
              <Trans>Search all companies</Trans>
            </StyledCorgiFormCheckbox>
          )}
          {loading && (
            <StyledCorgiFormHint role="status">
              <Trans>Searching…</Trans>
            </StyledCorgiFormHint>
          )}
          {error && (
            <StyledCorgiFormNotice role="alert">
              <Trans>Search unavailable. Try again.</Trans>
            </StyledCorgiFormNotice>
          )}
          <StyledResults>
            {records.map((record) => (
              <li key={record.id}>
                <StyledResult type="button" onClick={() => select(record)}>
                  {getCorgiRecordLabel(record)}
                  {record.company?.name ? ` · ${record.company.name}` : ''}
                  {record.address?.addressCity
                    ? ` · ${record.address.addressCity}, ${record.address.addressState ?? ''}`
                    : ''}
                  {record.territory ? ` · ${record.territory}` : ''}
                  {record.activeClient === true ? ` · ${t`Active client`}` : ''}
                </StyledResult>
              </li>
            ))}
          </StyledResults>
          <StyledPickerActions>
            {hasNextPage && (
              <StyledCorgiFormButton
                type="button"
                onClick={() => void fetchMoreRecords()}
              >
                <Trans>Load more</Trans>
              </StyledCorgiFormButton>
            )}
            {CORGI_CREATE_FIELDS[objectNameSingular] && (
              <StyledCorgiFormButton
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
              </StyledCorgiFormButton>
            )}
          </StyledPickerActions>
        </>
      )}
    </StyledCorgiFormGroup>
  );
};
