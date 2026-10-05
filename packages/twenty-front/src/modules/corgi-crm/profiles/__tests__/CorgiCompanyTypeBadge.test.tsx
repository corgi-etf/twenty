import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorgiCompanyTypeBadge } from '@/corgi-crm/profiles/components/CorgiCompanyTypeBadge';
import { TextFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/TextFieldDisplay';
let mockField = {
  fieldValue: 'registered investment advisor',
  displayedMaxRows: 1,
  fieldDefinition: {
    type: 'TEXT',
    metadata: { fieldName: 'firmType', objectMetadataNameSingular: 'company' },
  },
};
jest.mock(
  '@/object-record/record-field/ui/meta-types/hooks/useTextFieldDisplay',
  () => ({ useTextFieldDisplay: () => mockField }),
);
jest.mock('twenty-ui/data-display', () => ({
  Tag: ({ text, color }: { text: string; color: string }) => (
    <span data-type-color={color}>{text}</span>
  ),
  TextDisplay: ({ text }: { text: string }) => (
    <span data-testid="plain-text">{text}</span>
  ),
}));
const show = (value: string | null | undefined) =>
  render(
    <I18nProvider i18n={i18n}>
      <CorgiCompanyTypeBadge value={value} />
    </I18nProvider>,
  );
it('shows a readable known category with its stable semantic tag color', () => {
  show('REGISTERED INVESTMENT ADVISOR');
  expect(screen.getByText('RIA')).toHaveAttribute('data-type-color', 'blue');
  expect(screen.queryByText('Unmapped company type')).not.toBeInTheDocument();
});
it('preserves an unknown raw value in gray with a keyboard-accessible explanation', async () => {
  show('Bank / RIA hybrid');
  expect(screen.getByText('Bank / RIA hybrid')).toHaveAttribute(
    'data-type-color',
    'gray',
  );
  const badge = screen.getByTitle('Unmapped company type');
  expect(badge).toHaveAccessibleDescription('Unmapped company type');
  await userEvent.tab();
  expect(badge).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Unmapped company type',
  );
});
it('keeps missing company types empty', () => {
  const { container } = show(null);
  expect(container).toBeEmptyDOMElement();
});
it('applies company badges in native text displays without changing unrelated text fields', () => {
  const ui = (
    <I18nProvider i18n={i18n}>
      <TextFieldDisplay />
    </I18nProvider>
  );
  const rendered = render(ui);
  expect(screen.getByText('RIA')).toHaveAttribute('data-type-color', 'blue');
  mockField = {
    ...mockField,
    fieldDefinition: {
      ...mockField.fieldDefinition,
      metadata: { fieldName: 'firmType', objectMetadataNameSingular: 'person' },
    },
  };
  rendered.rerender(
    <I18nProvider i18n={i18n}>
      <TextFieldDisplay />
    </I18nProvider>,
  );
  expect(screen.getByTestId('plain-text')).toHaveTextContent(
    'registered investment advisor',
  );
});
