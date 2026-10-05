import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectRecordOperation } from '@/object-record/types/ObjectRecordOperation';

export type ObjectRecordOperationBrowserEventDetail = {
  source?: 'local-mutation';
  createInput?: Record<string, unknown>;
  objectMetadataItem: EnrichedObjectMetadataItem;
  operation: ObjectRecordOperation;
};
