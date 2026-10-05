import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorgiRelationPicker } from '@/corgi-crm/relations/components/CorgiRelationPicker';

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      fields: [{ id: 'name', name: 'name', type: 'TEXT' }],
      labelIdentifierFieldMetadataId: 'name',
    },
  }),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({
    records: [
      { id: 'a', name: 'Owner A' },
      { id: 'b', name: 'Owner B' },
    ],
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({}),
}));
jest.mock('@/corgi-crm/forms/hooks/useCorgiCreateRecordDialog', () => ({
  useCorgiCreateRecordDialog: () => ({ openCreateRecord: jest.fn() }),
}));
jest.mock('@/object-record/components/RecordChip', () => ({
  RecordChip: () => null,
}));

it('keeps the owner search usable after each selection', async () => {
  const onChange = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <CorgiRelationPicker
        objectNameSingular="wholesaler"
        label="Owners"
        keepOpenOnSelect
        onChange={onChange}
      />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Owner A' }));
  await user.click(screen.getByRole('button', { name: 'Owner B' }));
  expect(onChange.mock.calls.map(([record]) => record.id)).toEqual(['a', 'b']);
  expect(screen.getByRole('textbox', { name: 'Search Owners' })).toBeVisible();
});
