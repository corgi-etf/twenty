import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { FieldMetadataType } from '~/generated-metadata/graphql';

type QuickLogActivityMetadataStatus =
  | { isAvailable: true }
  | { isAvailable: false; reason: string };

type QuickLogObjectMetadata = Pick<
  EnrichedObjectMetadataItem,
  'nameSingular'
> & {
  fields: Array<
    Pick<EnrichedObjectMetadataItem['fields'][number], 'name' | 'type'>
  >;
};

const REQUIRED_OUTREACH_FIELDS = [
  ['name', FieldMetadataType.TEXT],
  ['activityType', FieldMetadataType.TEXT],
  ['outcome', FieldMetadataType.TEXT],
  ['notes', FieldMetadataType.TEXT],
  ['occurredAt', FieldMetadataType.DATE_TIME],
  ['followUpDate', FieldMetadataType.DATE],
  ['company', FieldMetadataType.RELATION],
  ['contact', FieldMetadataType.RELATION],
  ['wholesaler', FieldMetadataType.RELATION],
] as const;

export const getQuickLogActivityMetadataStatus = (
  objectMetadataItems: QuickLogObjectMetadata[],
): QuickLogActivityMetadataStatus => {
  const outreachActivity = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'outreachActivity',
  );
  const person = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'person',
  );
  const wholesaler = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'wholesaler',
  );

  if (!outreachActivity || !person || !wholesaler) {
    return {
      isAvailable: false,
      reason: 'Follow-up data is not configured for this workspace.',
    };
  }

  const missingField = REQUIRED_OUTREACH_FIELDS.find(
    ([fieldName, fieldType]) =>
      !outreachActivity.fields.some(
        (field) => field.name === fieldName && field.type === fieldType,
      ),
  );

  if (missingField) {
    return {
      isAvailable: false,
      reason: `Follow-up field ${missingField[0]} is not configured.`,
    };
  }

  const hasWholesalerEmail = wholesaler.fields.some(
    (field) => field.name === 'email' && field.type === FieldMetadataType.TEXT,
  );

  if (!hasWholesalerEmail) {
    return {
      isAvailable: false,
      reason: 'Wholesaler email matching is not configured.',
    };
  }

  return { isAvailable: true };
};
