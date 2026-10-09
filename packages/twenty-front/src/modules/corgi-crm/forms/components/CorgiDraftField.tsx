import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledCorgiFormCheckbox,
  StyledCorgiFormField,
  StyledCorgiFormGroup,
  StyledCorgiFormLabel,
  StyledCorgiFormLegend,
  StyledCorgiFormRow,
} from '@/corgi-crm/forms/components/CorgiFormStyles';

type CorgiDraftFieldProps = {
  field: FieldMetadataItem;
  value: unknown;
  companyId?: string;
  isRequired?: boolean;
  onChange: (value: unknown, record?: ObjectRecord) => void;
};
// Unsupported metadata field types intentionally have no draft editor.
// oxlint-disable-next-line twenty/effect-components
export const CorgiDraftField = ({
  field,
  value,
  companyId,
  isRequired = false,
  onChange,
}: CorgiDraftFieldProps) => {
  const { t } = useLingui();
  const composite = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    string | number | null
  >;
  const input = (name: string, label: string, type = 'text') => (
    <StyledCorgiFormField key={name}>
      <StyledCorgiFormLabel>{label}</StyledCorgiFormLabel>
      <input
        type={type}
        value={String(composite[name] ?? '')}
        onChange={(event) =>
          onChange({ ...composite, [name]: event.target.value })
        }
      />
    </StyledCorgiFormField>
  );
  const fieldLabel = (
    <StyledCorgiFormLabel data-required={isRequired}>
      {field.label}
    </StyledCorgiFormLabel>
  );
  const groupLegend = (label: string) => (
    <StyledCorgiFormLegend data-required={isRequired}>
      {label}
    </StyledCorgiFormLegend>
  );
  if (field.type === 'RELATION' && field.relation?.type === 'MANY_TO_ONE')
    return (
      <CorgiRelationPicker
        objectNameSingular={field.relation.targetObjectMetadata.nameSingular}
        label={field.label}
        value={typeof value === 'string' ? value : undefined}
        companyId={companyId}
        isRequired={isRequired}
        openProfileInNewTab
        onChange={(record) => onChange(record?.id ?? null, record)}
      />
    );
  if (field.type === 'BOOLEAN')
    return (
      <StyledCorgiFormCheckbox>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </StyledCorgiFormCheckbox>
    );
  if (field.type === 'ADDRESS')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(t`Address`)}
        <StyledCorgiFormRow>
          {input('addressCity', t`City`)}
          {input('addressState', t`State`)}
        </StyledCorgiFormRow>
        <details>
          <summary>
            <Trans>Street and postal address</Trans>
          </summary>
          {input('addressStreet1', t`Street`)}
          {input('addressStreet2', t`Address line 2`)}
          {input('addressPostcode', t`Postal code`)}
          {input('addressCountry', t`Country`)}
        </details>
      </StyledCorgiFormGroup>
    );
  if (field.type === 'FULL_NAME')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(field.label)}
        <StyledCorgiFormRow>
          {input('firstName', t`First name`)}
          {input('lastName', t`Last name`)}
        </StyledCorgiFormRow>
      </StyledCorgiFormGroup>
    );
  if (field.type === 'LINKS')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(field.label)}
        {input('primaryLinkUrl', t`URL`, 'url')}
      </StyledCorgiFormGroup>
    );
  if (field.type === 'EMAILS')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(field.label)}
        {input('primaryEmail', t`Email`, 'email')}
      </StyledCorgiFormGroup>
    );
  if (field.type === 'PHONES')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(field.label)}
        <StyledCorgiFormRow>
          {input('primaryPhoneNumber', t`Phone`, 'tel')}
          {input('primaryPhoneCallingCode', t`Calling code`)}
        </StyledCorgiFormRow>
      </StyledCorgiFormGroup>
    );
  if (field.type === 'CURRENCY')
    return (
      <StyledCorgiFormGroup>
        {groupLegend(field.label)}
        <StyledCorgiFormRow>
          <StyledCorgiFormField>
            <StyledCorgiFormLabel>
              <Trans>Amount</Trans>
            </StyledCorgiFormLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              value={
                typeof composite.amountMicros === 'number'
                  ? composite.amountMicros / 1000000
                  : ''
              }
              onChange={(event) =>
                onChange({
                  ...composite,
                  currencyCode: composite.currencyCode ?? 'USD',
                  amountMicros: event.target.value
                    ? Math.round(Number(event.target.value) * 1000000)
                    : null,
                })
              }
            />
          </StyledCorgiFormField>
          <StyledCorgiFormField>
            <StyledCorgiFormLabel>
              <Trans>Currency</Trans>
            </StyledCorgiFormLabel>
            <input
              maxLength={3}
              value={String(composite.currencyCode ?? 'USD')}
              onChange={(event) =>
                onChange({
                  ...composite,
                  currencyCode: event.target.value.toUpperCase(),
                })
              }
            />
          </StyledCorgiFormField>
        </StyledCorgiFormRow>
      </StyledCorgiFormGroup>
    );
  if (field.type === 'SELECT')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <select
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{t`Select`}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </StyledCorgiFormField>
    );
  if (field.type === 'DATE_TIME') {
    const date = typeof value === 'string' ? new Date(value) : undefined;
    const localValue =
      date && !Number.isNaN(date.valueOf())
        ? new Date(date.valueOf() - date.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : '';
    return (
      <StyledCorgiFormField>
        <StyledCorgiFormLabel data-required={isRequired}>
          {field.label} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        </StyledCorgiFormLabel>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(event) =>
            onChange(
              event.target.value
                ? new Date(event.target.value).toISOString()
                : null,
            )
          }
        />
      </StyledCorgiFormField>
    );
  }
  if (field.type === 'DATE')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <input
          type="date"
          value={String(value ?? '').slice(0, 10)}
          onChange={(event) => onChange(event.target.value || null)}
        />
      </StyledCorgiFormField>
    );
  if (field.type === 'NUMBER')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value ? Number(event.target.value) : null)
          }
        />
      </StyledCorgiFormField>
    );
  if (field.type === 'RICH_TEXT')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <textarea
          value={String(composite.markdown ?? '')}
          onChange={(event) =>
            onChange({ markdown: event.target.value, blocknote: null })
          }
        />
      </StyledCorgiFormField>
    );
  if (field.type === 'MULTI_SELECT')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <select
          multiple
          value={Array.isArray(value) ? value : []}
          onChange={(event) =>
            onChange(
              Array.from(event.target.selectedOptions, ({ value }) => value),
            )
          }
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </StyledCorgiFormField>
    );
  if (field.type === 'TEXT')
    return (
      <StyledCorgiFormField>
        {fieldLabel}
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </StyledCorgiFormField>
    );
  return null;
};
