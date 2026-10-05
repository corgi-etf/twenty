import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorgiAccentPalettePicker } from '../components/CorgiAccentPalettePicker';

const mockUpdate = jest.fn();
let mockRecord = { id: 'member', accentPalette: 'Blue' };
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      { nameSingular: 'workspaceMember', fields: [{ name: 'accentPalette' }] },
    ],
  }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ record: mockRecord }),
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdate }),
}));
jest.mock('@/corgi-crm/settings/hooks/useCorgiAccentPalette', () => ({
  useCorgiAccentPalette: () => {
    const [palette, setPalette] = require('react').useState('Blue');
    return { palette, setPalette, memberId: 'member' };
  },
}));
const show = () =>
  render(
    <I18nProvider i18n={i18n}>
      <CorgiAccentPalettePicker />
    </I18nProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockRecord = { id: 'member', accentPalette: 'Blue' };
});
it('retains a successful selection while the query still has its previous value', async () => {
  mockUpdate.mockResolvedValue({ id: 'member', accentPalette: 'Violet' });
  show();
  await userEvent.selectOptions(
    screen.getByLabelText('Accent palette'),
    'Violet',
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Accent palette')).toHaveValue('Violet'),
  );
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      idToUpdate: 'member',
      updateOneRecordInput: { accentPalette: 'Violet' },
    }),
  );
});
it('keeps the previous palette on failure and shows a retryable error', async () => {
  mockUpdate.mockRejectedValue(new Error('Offline'));
  show();
  await userEvent.selectOptions(
    screen.getByLabelText('Accent palette'),
    'Teal',
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save'),
  );
  expect(screen.getByLabelText('Accent palette')).toHaveValue('Blue');
});
it('hydrates from the saved member preference on reload', async () => {
  mockRecord = { id: 'member', accentPalette: 'Warm' };
  show();
  await waitFor(() =>
    expect(screen.getByLabelText('Accent palette')).toHaveValue('Warm'),
  );
  expect(mockUpdate).not.toHaveBeenCalled();
});
