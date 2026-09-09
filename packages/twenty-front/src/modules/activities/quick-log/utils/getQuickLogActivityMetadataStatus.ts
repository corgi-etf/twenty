import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

type QuickLogActivityMetadataStatus =
  | { isAvailable: true }
  | { isAvailable: false; reason: string };

type QuickLogObjectMetadata = {
  nameSingular: string;
  fields: Array<{
    name: string;
    type: FieldMetadataType;
    relation?: {
      type: RelationType;
      targetObjectMetadata: { nameSingular: string };
    } | null;
  }>;
};

const REQUIRED_OUTREACH_FIELDS = [
  ['name', FieldMetadataType.TEXT],
  ['activityType', FieldMetadataType.TEXT],
  ['outcome', FieldMetadataType.TEXT],
  ['notes', FieldMetadataType.TEXT],
  ['occurredAt', FieldMetadataType.DATE_TIME],
  ['followUpDate', FieldMetadataType.DATE],
  ['company', FieldMetadataType.RELATION, 'company'],
  ['contact', FieldMetadataType.RELATION, 'person'],
  ['wholesaler', FieldMetadataType.RELATION, 'wholesaler'],
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
  const workspaceMember = objectMetadataItems.find(
    ({ nameSingular }) => nameSingular === 'workspaceMember',
  );

  if (!outreachActivity || !person || !wholesaler || !workspaceMember) {
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

  const incompatibleRelation = REQUIRED_OUTREACH_FIELDS.find(
    ([fieldName, fieldType, targetObjectNameSingular]) => {
      if (fieldType !== FieldMetadataType.RELATION) {
        return false;
      }

      const relationField = outreachActivity.fields.find(
        (field) => field.name === fieldName,
      );

      return (
        relationField?.relation?.type !== RelationType.MANY_TO_ONE ||
        relationField.relation.targetObjectMetadata.nameSingular !==
          targetObjectNameSingular
      );
    },
  );

  if (incompatibleRelation) {
    return {
      isAvailable: false,
      reason: `Follow-up relation ${incompatibleRelation[0]} is not configured correctly.`,
    };
  }

  const workspaceMemberRelation = wholesaler.fields.find(
    (field) => field.name === 'workspaceMember',
  );

  if (
    workspaceMemberRelation?.type !== FieldMetadataType.RELATION ||
    workspaceMemberRelation.relation?.type !== RelationType.MANY_TO_ONE ||
    workspaceMemberRelation.relation.targetObjectMetadata.nameSingular !==
      'workspaceMember'
  ) {
    return {
      isAvailable: false,
      reason: 'Wholesaler workspace member ownership is not configured.',
    };
  }

  return { isAvailable: true };
};
