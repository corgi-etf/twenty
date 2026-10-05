import { CorgiCompanyTypeBadge } from '@/corgi-crm/profiles/components/CorgiCompanyTypeBadge';
import { useTextFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useTextFieldDisplay';
import { isFieldText } from '@/object-record/record-field/ui/types/guards/isFieldText';
import { TextDisplay } from 'twenty-ui/data-display';

export const TextFieldDisplay = () => {
  const { fieldValue, fieldDefinition, displayedMaxRows } =
    useTextFieldDisplay();

  const displayedMaxRowsFromSettings = isFieldText(fieldDefinition)
    ? fieldDefinition.metadata?.settings?.displayedMaxRows
    : undefined;

  const displayMaxRowCalculated = displayedMaxRows
    ? displayedMaxRows
    : displayedMaxRowsFromSettings;

  if (
    fieldDefinition.metadata.fieldName === 'firmType' &&
    fieldDefinition.metadata.objectMetadataNameSingular === 'company'
  )
    return <CorgiCompanyTypeBadge value={fieldValue} />;

  return (
    <TextDisplay text={fieldValue} displayedMaxRows={displayMaxRowCalculated} />
  );
};
