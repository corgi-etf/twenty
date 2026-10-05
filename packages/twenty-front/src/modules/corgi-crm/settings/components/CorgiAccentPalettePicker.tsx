import { useEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useCorgiAccentPalette } from '@/corgi-crm/settings/hooks/useCorgiAccentPalette';
import {
  CORGI_ACCENT_PALETTES,
  getCorgiAccentPalette,
  type CorgiAccentPalette,
} from '@/corgi-crm/settings/utils/corgiAccentPalette';

const ReadyCorgiAccentPalette = ({ showPicker }: { showPicker: boolean }) => {
  const { t } = useLingui();
  const { palette, setPalette, memberId } = useCorgiAccentPalette();
  const { record } = useFindOneRecord({
    objectNameSingular: 'workspaceMember',
    objectRecordId: memberId,
    recordGqlFields: { id: true, accentPalette: true },
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const serverPalette =
    record && record.id === memberId
      ? getCorgiAccentPalette(record.accentPalette)
      : undefined;
  useEffect(() => {
    if (serverPalette) setPalette(serverPalette);
  }, [serverPalette, memberId, setPalette]);
  if (!showPicker) return null;
  return (
    <label>
      {t`Accent palette`}
      <select
        aria-label={t`Accent palette`}
        value={palette}
        disabled={saving || !memberId}
        onChange={async (event) => {
          if (!memberId) return;
          const value = event.target.value as CorgiAccentPalette;
          setSaving(true);
          setError(undefined);
          try {
            await updateOneRecord({
              objectNameSingular: 'workspaceMember',
              idToUpdate: memberId,
              updateOneRecordInput: { accentPalette: value },
              recordGqlFields: { id: true, accentPalette: true },
            });
            setPalette(value);
          } catch {
            setError(t`Could not save your palette. Try again.`);
          } finally {
            setSaving(false);
          }
        }}
      >
        {CORGI_ACCENT_PALETTES.map((value) => (
          <option key={value} value={value}>
            {value === 'Blue'
              ? t`Blue`
              : value === 'Teal'
                ? t`Teal`
                : value === 'Violet'
                  ? t`Violet`
                  : t`Warm`}
          </option>
        ))}
      </select>
      <p>
        <Trans>
          Business status colors keep their meaning in every palette.
        </Trans>
      </p>
      {error && <span role="alert">{error}</span>}
    </label>
  );
};

export const CorgiAccentPalettePicker = ({
  showPicker = true,
}: {
  showPicker?: boolean;
}) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  if (
    !objectMetadataItems.some(
      ({ nameSingular, fields }) =>
        nameSingular === 'workspaceMember' &&
        fields.some(({ name }) => name === 'accentPalette'),
    )
  )
    return null;
  return <ReadyCorgiAccentPalette showPicker={showPicker} />;
};
