import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorgiCreateRecordDialog } from '../components/CorgiCreateRecordDialogHost';

const mockCreate = jest.fn();
const mockClose = jest.fn();
let mockRestrictedFields = {};
const mockMetadata = {
  id: 'company-metadata',
  labelSingular: 'Company',
  fields: [
    {
      id: 'name',
      name: 'name',
      label: 'Name',
      type: 'TEXT',
      isActive: true,
      isUIEditable: true,
    },
    {
      id: 'active',
      name: 'activeClient',
      label: 'Active client',
      type: 'BOOLEAN',
      isActive: true,
      isUIEditable: true,
    },
  ],
};
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: mockMetadata }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canUpdateObjectRecords: true,
    restrictedFields: mockRestrictedFields,
  }),
}));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreate }),
}));
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({ records: [] }),
}));
jest.mock('@/corgi-crm/settings/components/CorgiAccentPalettePicker', () => ({
  CorgiAccentPalettePicker: () => null,
}));
jest.mock('@/corgi-crm/relations/components/CorgiRelationPicker', () => ({
  CorgiRelationPicker: () => null,
}));
const show = (initialValues?: Record<string, unknown>) =>
  render(
    <I18nProvider i18n={i18n}>
      <CorgiCreateRecordDialog
        dialog={{
          id: 'draft',
          objectNameSingular: 'company',
          resolve: jest.fn(),
          trigger: null,
          initialValues,
        }}
        active
        close={mockClose}
      />
    </I18nProvider>,
  );
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  mockRestrictedFields = {};
});

it('cancel leaves no empty record', async () => {
  const user = userEvent.setup();
  show();
  await user.type(screen.getByLabelText('Name'), 'Draft company');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockClose).toHaveBeenCalledWith();
});
it('save validates name and preserves the draft after a failed save', async () => {
  const user = userEvent.setup();
  mockCreate.mockRejectedValueOnce(new Error('Network unavailable'));
  show();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mockCreate).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  await user.type(screen.getByLabelText('Name'), 'Example company');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'),
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Example company');
  expect(mockClose).not.toHaveBeenCalled();
});
it('writes once after Save and suppresses duplicate submission', async () => {
  const user = userEvent.setup();
  let finish: (record: { id: string; name: string }) => void = () => {};
  mockCreate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  await user.type(screen.getByLabelText('Name'), 'Saved company');
  await user.dblClick(screen.getByRole('button', { name: 'Save' }));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  finish({ id: 'saved', name: 'Saved company' });
  await waitFor(() =>
    expect(mockClose).toHaveBeenCalledWith({
      id: 'saved',
      name: 'Saved company',
    }),
  );
});

it('does not expose a field denied by field permissions', () => {
  mockRestrictedFields = { active: { canRead: false, canUpdate: false } };
  show();
  expect(screen.queryByLabelText('Active client')).not.toBeInTheDocument();
});

it('saves a contextual draft without relationship fields from another object', async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValueOnce({ id: 'saved', name: 'Linked company' });
  show({
    name: 'Linked company',
    activeClient: true,
    meetingId: 'source-meeting',
    externalWholesalerId: 'source-wholesaler',
  });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockClose).toHaveBeenCalled());
  expect(mockCreate).toHaveBeenCalledWith({
    id: expect.any(String),
    name: 'Linked company',
    activeClient: true,
  });
});

it('logs one activity per ticked action, crediting the firm', async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValue({ id: 'firm-1', name: 'Noesis Capital' });
  show();
  await user.type(screen.getByLabelText('Name'), 'Noesis Capital');
  await user.click(screen.getByRole('checkbox', { name: 'Called' }));
  await user.click(screen.getByRole('checkbox', { name: 'Emailed' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  // The firm, then one activity per tick. Counting activities rather than
  // setting flags is what keeps "number of calls" meaning what it says.
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(3));
  const types = mockCreate.mock.calls
    .slice(1)
    .map(([input]) => input.activityType);
  expect(types).toEqual(['PHONE_CALL', 'EMAIL']);
  for (const [input] of mockCreate.mock.calls.slice(1)) {
    expect(input.companyId).toBe('firm-1');
    expect(input.name).toContain('Noesis Capital');
  }
});

it('records a voicemail as a call attempt with its outcome', async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValue({ id: 'firm-2', name: 'Balanz' });
  show();
  await user.type(screen.getByLabelText('Name'), 'Balanz');
  await user.click(screen.getByRole('checkbox', { name: 'Voicemail' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1][0]).toMatchObject({
    activityType: 'PHONE_CALL',
    outcome: 'Voicemail',
  });
});

it('logs a follow-up on its own when nothing else was done', async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValue({ id: 'firm-3', name: 'Unimar' });
  show();
  await user.type(screen.getByLabelText('Name'), 'Unimar');
  await user.click(screen.getByRole('checkbox', { name: 'Needs follow-up' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1][0]).toMatchObject({
    activityType: 'OTHER',
  });
  expect(mockCreate.mock.calls[1][0].followUpDate).toBeDefined();
});

it('creates no activity when nothing is ticked', async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValue({ id: 'firm-4', name: 'Sparrow' });
  show();
  await user.type(screen.getByLabelText('Name'), 'Sparrow');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
});
