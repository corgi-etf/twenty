import { useContext } from 'react';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { CorgiClientBadge } from '@/corgi-crm/profiles/components/CorgiClientBadge';
import { useBooleanFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useBooleanFieldDisplay';
import { BooleanDisplay } from '@/ui/field/display/components/BooleanDisplay';

export const BooleanFieldDisplay = () => {
  const { fieldValue } = useBooleanFieldDisplay();
  const { fieldDefinition } = useContext(FieldContext);
  if (fieldDefinition.metadata.fieldName === 'activeClient')
    return <CorgiClientBadge active={fieldValue === true} />;

  return <BooleanDisplay value={fieldValue} />;
};
