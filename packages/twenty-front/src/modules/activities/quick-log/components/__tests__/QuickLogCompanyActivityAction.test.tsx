import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FieldMetadataType } from '~/generated-metadata/graphql';

import { QuickLogCompanyActivityAction } from '@/activities/quick-log/components/QuickLogCompanyActivityAction';

const mockOpenModal = jest.fn();
let mockObjectMetadataItems: Array<{
  nameSingular: string;
  fields: Array<{ name: string; type: FieldMetadataType }>;
}> = [];

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

jest.mock(
  '@/activities/quick-log/components/QuickLogCompanyActivityModal',
  () => ({
    QuickLogCompanyActivityModal: () => <div data-testid="quick-log-modal" />,
  }),
);

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    disabled,
    onClick,
  }: {
    title: string;
    ariaLabel?: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

const configuredMetadata = [
  {
    nameSingular: 'outreachActivity',
    fields: [
      { name: 'name', type: FieldMetadataType.TEXT },
      { name: 'activityType', type: FieldMetadataType.TEXT },
      { name: 'outcome', type: FieldMetadataType.TEXT },
      { name: 'notes', type: FieldMetadataType.TEXT },
      { name: 'occurredAt', type: FieldMetadataType.DATE_TIME },
      { name: 'followUpDate', type: FieldMetadataType.DATE },
      { name: 'company', type: FieldMetadataType.RELATION },
      { name: 'contact', type: FieldMetadataType.RELATION },
      { name: 'wholesaler', type: FieldMetadataType.RELATION },
    ],
  },
  { nameSingular: 'person', fields: [] },
  {
    nameSingular: 'wholesaler',
    fields: [{ name: 'email', type: FieldMetadataType.TEXT }],
  },
];

describe('QuickLogCompanyActivityAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectMetadataItems = configuredMetadata;
  });

  it('opens the quick-log modal from a Company record', () => {
    render(
      <I18nProvider i18n={i18n}>
        <QuickLogCompanyActivityAction
          objectNameSingular="company"
          companyId="company-1"
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Log a follow-up for this company',
      }),
    );

    expect(mockOpenModal).toHaveBeenCalledWith(
      'quick-log-company-activity-company-1',
    );
    expect(screen.getByTestId('quick-log-modal')).toBeInTheDocument();
  });

  it('shows a clear disabled action when metadata is unavailable', () => {
    mockObjectMetadataItems = [];

    render(
      <I18nProvider i18n={i18n}>
        <QuickLogCompanyActivityAction
          objectNameSingular="company"
          companyId="company-1"
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('button', {
        name: 'Follow-up data is not configured for this workspace.',
      }),
    ).toBeDisabled();
  });

  it('does not render on non-Company records', () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <QuickLogCompanyActivityAction
          objectNameSingular="person"
          companyId="person-1"
        />
      </I18nProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
