import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorgiCompanyOwners } from '@/corgi-crm/profiles/components/CorgiCompanyOwners';
const mockMutation = jest.fn();
const mockRestore = jest.fn();
const mockDelete = jest.fn();
const mockCreate = jest.fn();
const mockRefetch = jest.fn();
let mockHasNextPage = false;
let mockRecords = [
  {
    id: 'owner-a',
    wholesalerId: 'a',
    isPrimary: true,
    deletedAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    wholesaler: { id: 'a', name: 'A' },
  },
  {
    id: 'owner-b',
    wholesalerId: 'b',
    isPrimary: true,
    deletedAt: null,
    updatedAt: '2026-10-05T00:00:00Z',
    wholesaler: { id: 'b', name: 'B' },
  },
];
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ mutate: mockMutation }),
}));
jest.mock('@/object-record/hooks/useUpdateManyRecordsMutation', () => ({
  useUpdateManyRecordsMutation: () => ({ updateManyRecordsMutation: 'update' }),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({
    records: mockRecords,
    refetch: mockRefetch,
    hasNextPage: mockHasNextPage,
    fetchMoreRecords: jest.fn(),
  }),
}));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreate }),
}));
jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: () => ({ deleteOneRecord: mockDelete }),
}));
jest.mock('@/object-record/hooks/useRestoreManyRecords', () => ({
  useRestoreManyRecords: () => ({ restoreManyRecords: mockRestore }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: true,
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'ownership' } }),
}));
jest.mock('@/object-record/components/RecordChip', () => ({
  RecordChip: ({ record }: { record: { name: string } }) => (
    <span>{record.name}</span>
  ),
}));
jest.mock('@/corgi-crm/relations/components/CorgiRelationPicker', () => ({
  CorgiRelationPicker: ({
    onChange,
  }: {
    onChange: (record: { id: string }) => void;
  }) => <button onClick={() => onChange({ id: 'a' })}>Link A</button>,
}));
const show = () =>
  render(
    <I18nProvider i18n={i18n}>
      <CorgiCompanyOwners companyId="company" />
    </I18nProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockHasNextPage = false;
  mockRecords[0]!.isPrimary = true;
});
it('clears a former primary flag before restoring when another owner is primary', async () => {
  mockMutation.mockImplementation(async ({ variables }) => {
    mockRecords[0]!.isPrimary = variables.data.isPrimary;
    return { data: { updateCompanyOwnerships: [{ id: 'owner-a' }] } };
  });
  mockRestore.mockImplementation(async () => {
    expect(mockRecords[0]!.isPrimary).toBe(false);
  });
  show();
  await userEvent.click(screen.getByText('Link A'));
  await waitFor(() =>
    expect(mockRestore).toHaveBeenCalledWith({ idsToRestore: ['owner-a'] }),
  );
  expect(mockMutation.mock.calls[0][0].variables.filter.and).toContainEqual({
    deletedAt: { is: 'NOT_NULL' },
  });
  expect(mockCreate).not.toHaveBeenCalled();
});
it('does not restore when guarded tombstone update fails', async () => {
  mockMutation.mockResolvedValue({ data: { updateCompanyOwnerships: [] } });
  show();
  await userEvent.click(screen.getByText('Link A'));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('changed'),
  );
  expect(mockRestore).not.toHaveBeenCalled();
});
it('removes only the ownership link and waits for all pages before offering changes', async () => {
  show();
  await userEvent.click(screen.getByText('Remove link'));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('owner-b'));
  expect(mockCreate).not.toHaveBeenCalled();
});
it('does not infer a primary owner from an incomplete page', () => {
  mockHasNextPage = true;
  show();
  expect(screen.queryByText('Link A')).not.toBeInTheDocument();
  expect(screen.getByText('Load more')).toBeInTheDocument();
});
