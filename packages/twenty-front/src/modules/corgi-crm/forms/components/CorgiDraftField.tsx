import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';
import { Trans, useLingui } from '@lingui/react/macro';

type CorgiDraftFieldProps = {
  field: FieldMetadataItem;
  value: unknown;
  companyId?: string;
  onChange: (value: unknown, record?: ObjectRecord) => void;
};
export const CorgiDraftField = ({
  field,
  value,
  companyId,
  onChange,
}: CorgiDraftFieldProps) => {
  const { t } = useLingui();
  const composite = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    string | number | null
  >;
  const input = (name: string, label: string, type = 'text') => (
    <label key={name}>
      {label}
      <input
        type={type}
        value={String(composite[name] ?? '')}
        onChange={(event) =>
          onChange({ ...composite, [name]: event.target.value })
        }
      />
    </label>
  );
  if (field.type === 'RELATION' && field.relation?.type === 'MANY_TO_ONE')
    return (
      <CorgiRelationPicker
        objectNameSingular={field.relation.targetObjectMetadata.nameSingular}
        label={field.label}
        value={typeof value === 'string' ? value : undefined}
        companyId={companyId}
        onChange={(record) => onChange(record?.id ?? null, record)}
      />
    );
  if (field.type === 'BOOLEAN')
    return (
      <label>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === 'ADDRESS')
    return (
      <fieldset>
        <legend>{t`Address`}</legend>
        {input('addressCity', t`City`)}
        {input('addressState', t`State`)}
        <details>
          <summary>
            <Trans>Street and postal address</Trans>
          </summary>
          {input('addressStreet1', t`Street`)}
          {input('addressStreet2', t`Address line 2`)}
          {input('addressPostcode', t`Postal code`)}
          {input('addressCountry', t`Country`)}
        </details>
      </fieldset>
    );
  if (field.type === 'FULL_NAME')
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {input('firstName', t`First name`)}
        {input('lastName', t`Last name`)}
      </fieldset>
    );
  if (field.type === 'LINKS')
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {input('primaryLinkUrl', t`URL`, 'url')}
      </fieldset>
    );
  if (field.type === 'EMAILS')
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {input('primaryEmail', t`Email`, 'email')}
      </fieldset>
    );
  if (field.type === 'PHONES')
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {input('primaryPhoneNumber', t`Phone`, 'tel')}
        {input('primaryPhoneCallingCode', t`Calling code`)}
      </fieldset>
    );
  if (field.type === 'CURRENCY')
    return (
      <fieldset>
        <legend>{field.label}</legend>
        <label>
          <Trans>Amount</Trans>
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
        </label>
        <label>
          <Trans>Currency</Trans>
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
        </label>
      </fieldset>
    );
  if (field.type === 'SELECT')
    return (
      <label>
        {field.label}
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
      </label>
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
      <label>
        {field.label} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
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
      </label>
    );
  }
  if (field.type === 'DATE')
    return (
      <label>
        {field.label}
        <input
          type="date"
          value={String(value ?? '').slice(0, 10)}
          onChange={(event) => onChange(event.target.value || null)}
        />
      </label>
    );
  if (field.type === 'NUMBER')
    return (
      <label>
        {field.label}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value ? Number(event.target.value) : null)
          }
        />
      </label>
    );
  if (field.type === 'RICH_TEXT')
    return (
      <label>
        {field.label}
        <textarea
          value={String(composite.markdown ?? '')}
          onChange={(event) =>
            onChange({ markdown: event.target.value, blocknote: null })
          }
        />
      </label>
    );
  if (field.type === 'MULTI_SELECT')
    return (
      <label>
        {field.label}
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
      </label>
    );
  if (field.type === 'TEXT')
    return (
      <label>
        {field.label}
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  return null;
};
