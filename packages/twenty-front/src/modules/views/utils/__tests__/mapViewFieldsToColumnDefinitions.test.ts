import { mapViewFieldsToColumnDefinitions } from '@/views/utils/mapViewFieldsToColumnDefinitions';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const column = (
  name: string,
  position: number,
): ColumnDefinition<FieldMetadata> => ({
  fieldMetadataId: name,
  label: name,
  iconName: 'IconText',
  type: FieldMetadataType.TEXT,
  metadata: {
    fieldName: name,
    objectMetadataNameSingular: 'outreachActivity',
    placeHolder: '',
  },
  position,
  size: 150,
  isLabelIdentifier: name === 'name',
  isVisible: true,
});
it('keeps activity type before the clickable label when the view requests it', () => {
  const columns = [column('name', 0), column('activityType', 1)];
  const result = mapViewFieldsToColumnDefinitions({
    columnDefinitions: columns,
    viewFields: [
      {
        id: 'name-view',
        fieldMetadataId: 'name',
        position: 1,
        size: 200,
        isVisible: true,
        isActive: true,
      },
      {
        id: 'type-view',
        fieldMetadataId: 'activityType',
        position: 0,
        size: 150,
        isVisible: true,
        isActive: true,
      },
    ],
  });
  expect(result.map(({ fieldMetadataId }) => fieldMetadataId)).toEqual([
    'activityType',
    'name',
  ]);
  expect(result[1].isLabelIdentifier).toBe(true);
  expect(result[1].isVisible).toBe(true);
});
