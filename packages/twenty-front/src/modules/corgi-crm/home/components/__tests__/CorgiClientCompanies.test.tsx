import { CorgiClientCompanies } from '@/corgi-crm/home/components/CorgiClientCompanies';
import { type CorgiClientCompany } from '@/corgi-crm/types/CorgiHome';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

it('expands a client into separate credited-wholesaler and contact allocation breakdowns with truthful restricted attribution', async () => {
  const amounts = [{ amountMicros: '1000000000', currencyCode: 'USD' }];
  const client: CorgiClientCompany = {
    company: {
      id: 'company',
      label: 'Allocated company',
      objectNameSingular: 'company',
      objectNamePlural: 'companies',
    },
    allocationCount: 2,
    amounts,
    lastAllocationAt: '2026-10-05T15:00:00Z',
    creditedWholesalers: [
      {
        person: {
          id: 'salesperson',
          label: 'Credited salesperson',
          objectNameSingular: 'wholesaler',
          objectNamePlural: 'wholesalers',
        },
        allocationCount: 2,
        amounts,
      },
    ],
    contacts: [
      {
        person: null,
        attributionStatus: 'restricted',
        allocationCount: 1,
        amounts,
      },
      {
        person: null,
        attributionStatus: 'unassigned',
        allocationCount: 1,
        amounts,
      },
    ],
  };
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <CorgiClientCompanies clients={[client]} />
      </MemoryRouter>
    </I18nProvider>,
  );
  const summary = screen
    .getByRole('link', { name: 'Allocated company' })
    .closest('summary');
  expect(summary).not.toBeNull();
  if (summary) await userEvent.click(summary);
  expect(
    screen.getByRole('heading', { name: 'Credited salesperson / wholesaler' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Client contact' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Unavailable person').closest('a')).toBeNull();
  expect(screen.getByText('Unassigned')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '2 · $1,000.00' })).toHaveAttribute(
    'href',
    '/home?section=allocations&companyId=company&allTime=true&creditedWholesalerId=salesperson',
  );
});
