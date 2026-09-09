import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { QuickLogCompanyActivityModal } from '@/activities/quick-log/components/QuickLogCompanyActivityModal';

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn() }),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({
    ariaLabel,
    children,
  }: {
    ariaLabel?: string;
    children: ReactNode;
  }) => (
    <div role="dialog" aria-label={ariaLabel}>
      {children}
    </div>
  ),
}));

jest.mock(
  '@/activities/quick-log/components/QuickLogCompanyActivityForm',
  () => ({
    QuickLogCompanyActivityForm: () => <form aria-label="Quick log form" />,
  }),
);

describe('QuickLogCompanyActivityModal', () => {
  it('gives the dialog an accessible name', () => {
    render(
      <I18nProvider i18n={i18n}>
        <QuickLogCompanyActivityModal
          companyId="company-1"
          modalInstanceId="quick-log-company-activity-company-1"
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Log follow-up' }),
    ).toBeInTheDocument();
  });
});
