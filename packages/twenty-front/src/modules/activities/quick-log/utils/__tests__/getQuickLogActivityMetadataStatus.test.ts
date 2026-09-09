import { getQuickLogActivityMetadataStatus } from '@/activities/quick-log/utils/getQuickLogActivityMetadataStatus';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const relationField = (name: string, targetObjectNameSingular: string) => ({
  name,
  type: FieldMetadataType.RELATION,
  relation: {
    type: RelationType.MANY_TO_ONE,
    targetObjectMetadata: { nameSingular: targetObjectNameSingular },
  },
});

const outreachFields = [
  { name: 'name', type: FieldMetadataType.TEXT },
  { name: 'activityType', type: FieldMetadataType.TEXT },
  { name: 'outcome', type: FieldMetadataType.TEXT },
  { name: 'notes', type: FieldMetadataType.TEXT },
  { name: 'occurredAt', type: FieldMetadataType.DATE_TIME },
  { name: 'followUpDate', type: FieldMetadataType.DATE },
  relationField('company', 'company'),
  relationField('contact', 'person'),
  relationField('wholesaler', 'wholesaler'),
];

const configuredMetadata = [
  { nameSingular: 'outreachActivity', fields: outreachFields },
  { nameSingular: 'person', fields: [] },
  {
    nameSingular: 'wholesaler',
    fields: [relationField('workspaceMember', 'workspaceMember')],
  },
  { nameSingular: 'workspaceMember', fields: [] },
];

describe('getQuickLogActivityMetadataStatus', () => {
  it('accepts the canonical Outreach Activity schema', () => {
    expect(getQuickLogActivityMetadataStatus(configuredMetadata)).toEqual({
      isAvailable: true,
    });
  });

  it('explains when a required field is unavailable', () => {
    const metadataWithoutOutcome = configuredMetadata.map((item) =>
      item.nameSingular === 'outreachActivity'
        ? {
            ...item,
            fields: item.fields.filter((field) => field.name !== 'outcome'),
          }
        : item,
    );

    expect(getQuickLogActivityMetadataStatus(metadataWithoutOutcome)).toEqual({
      isAvailable: false,
      reason: 'Follow-up field outcome is not configured.',
    });
  });

  it('rejects a workspace without immutable member ownership', () => {
    const metadataWithoutWorkspaceMemberRelation = configuredMetadata.map(
      (item) =>
        item.nameSingular === 'wholesaler' ? { ...item, fields: [] } : item,
    );

    expect(
      getQuickLogActivityMetadataStatus(metadataWithoutWorkspaceMemberRelation),
    ).toEqual({
      isAvailable: false,
      reason: 'Wholesaler workspace member ownership is not configured.',
    });
  });

  it('rejects a wholesaler ownership relation with the wrong target', () => {
    const metadataWithWrongOwnershipTarget = configuredMetadata.map((item) =>
      item.nameSingular === 'wholesaler'
        ? { ...item, fields: [relationField('workspaceMember', 'person')] }
        : item,
    );

    expect(
      getQuickLogActivityMetadataStatus(metadataWithWrongOwnershipTarget),
    ).toEqual({
      isAvailable: false,
      reason: 'Wholesaler workspace member ownership is not configured.',
    });
  });

  it('rejects an Outreach Activity relation with the wrong target', () => {
    const metadataWithWrongCompanyTarget = configuredMetadata.map((item) =>
      item.nameSingular === 'outreachActivity'
        ? {
            ...item,
            fields: item.fields.map((field) =>
              field.name === 'company'
                ? relationField('company', 'person')
                : field,
            ),
          }
        : item,
    );

    expect(
      getQuickLogActivityMetadataStatus(metadataWithWrongCompanyTarget),
    ).toEqual({
      isAvailable: false,
      reason: 'Follow-up relation company is not configured correctly.',
    });
  });

  it('rejects a one-to-many Outreach Activity relation', () => {
    const metadataWithWrongCardinality = configuredMetadata.map((item) =>
      item.nameSingular === 'outreachActivity'
        ? {
            ...item,
            fields: item.fields.map((field) =>
              field.name === 'contact' &&
              'relation' in field &&
              field.relation !== undefined
                ? {
                    ...field,
                    relation: {
                      ...field.relation,
                      type: RelationType.ONE_TO_MANY,
                    },
                  }
                : field,
            ),
          }
        : item,
    );

    expect(
      getQuickLogActivityMetadataStatus(metadataWithWrongCardinality),
    ).toEqual({
      isAvailable: false,
      reason: 'Follow-up relation contact is not configured correctly.',
    });
  });
});
