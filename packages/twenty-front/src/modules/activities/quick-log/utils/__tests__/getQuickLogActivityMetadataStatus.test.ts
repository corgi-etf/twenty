import { getQuickLogActivityMetadataStatus } from '@/activities/quick-log/utils/getQuickLogActivityMetadataStatus';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const outreachFields = [
  { name: 'name', type: FieldMetadataType.TEXT },
  { name: 'activityType', type: FieldMetadataType.TEXT },
  { name: 'outcome', type: FieldMetadataType.TEXT },
  { name: 'notes', type: FieldMetadataType.TEXT },
  { name: 'occurredAt', type: FieldMetadataType.DATE_TIME },
  { name: 'followUpDate', type: FieldMetadataType.DATE },
  { name: 'company', type: FieldMetadataType.RELATION },
  { name: 'contact', type: FieldMetadataType.RELATION },
  { name: 'wholesaler', type: FieldMetadataType.RELATION },
];

const configuredMetadata = [
  { nameSingular: 'outreachActivity', fields: outreachFields },
  { nameSingular: 'person', fields: [] },
  {
    nameSingular: 'wholesaler',
    fields: [{ name: 'email', type: FieldMetadataType.TEXT }],
  },
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

  it('rejects a workspace without a wholesaler email field', () => {
    const metadataWithoutWholesalerEmail = configuredMetadata.map((item) =>
      item.nameSingular === 'wholesaler' ? { ...item, fields: [] } : item,
    );

    expect(
      getQuickLogActivityMetadataStatus(metadataWithoutWholesalerEmail),
    ).toEqual({
      isAvailable: false,
      reason: 'Wholesaler email matching is not configured.',
    });
  });
});
