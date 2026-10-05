import { CorgiFollowUpCompanies } from '@/corgi-crm/home/components/CorgiFollowUpCompanies';
import {
  type CorgiFollowUp,
  type CorgiFollowUpCompany,
} from '@/corgi-crm/types/CorgiHome';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestLink } from 'apollo-link-rest';
import fetchMock from 'jest-fetch-mock';
import { MemoryRouter } from 'react-router-dom';

const mockRefresh = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/corgi-crm/home/components/CorgiHomeProvider', () => ({
  useCorgiHome: () => ({ revision: 0, refresh: mockRefresh }),
}));
jest.mock('@/corgi-crm/home/hooks/useCorgiHomeEnabled', () => ({
  useCorgiHomeEnabled: () => true,
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdate }),
}));

const group = (completed: boolean): CorgiFollowUpCompany => {
  const company = {
    id: completed ? 'past-company' : 'future-company',
    label: completed
      ? 'Previously flagged company'
      : 'Future follow-up company',
    objectNameSingular: 'company',
    objectNamePlural: 'companies',
  };
  const reminder: CorgiFollowUp = {
    id: 'reminder',
    label: 'Discuss next quarter',
    objectNameSingular: 'outreachFollowUp',
    objectNamePlural: 'outreachFollowUps',
    createdAt: '2026-10-05T15:00:00Z',
    createdBy: 'Scheduler',
    dueAt: '2027-02-01T15:00:00Z',
    company,
    contact: null,
    activity: null,
    reason: 'Discuss next quarter',
    status: completed ? 'COMPLETED' : 'OPEN',
    canComplete: !completed,
  };
  return {
    company,
    nextDueAt: reminder.dueAt,
    lastActivityAt: reminder.createdAt,
    openCount: completed ? 0 : 1,
    totalCount: 1,
    reminders: [reminder],
    nextReminderCursor: null,
  };
};

const renderList = () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new RestLink({
      uri: 'https://crm.example/rest',
      credentials: 'include',
    }),
  });
  return render(
    <ApolloProvider client={client}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <CorgiFollowUpCompanies workspaceMemberId="selected-person" />
        </MemoryRouter>
      </I18nProvider>
    </ApolloProvider>,
  );
};

describe('Personal follow-up companies', () => {
  beforeEach(() => {
    fetchMock.enableMocks();
    fetchMock.resetMocks();
    mockRefresh.mockReset();
    mockUpdate.mockReset();
    fetchMock.mockResponse((request) =>
      Promise.resolve(
        JSON.stringify({
          data: {
            status: 'available',
            records:
              new URL(request.url).searchParams.get('section') ===
              'legacyFollowUps'
                ? []
                : [
                    group(
                      new URL(request.url).searchParams.get('status') ===
                        'completed',
                    ),
                  ],
            totalCount: 1,
            nextCursor: null,
          },
        }),
      ),
    );
  });
  afterEach(() => fetchMock.disableMocks());

  it('includes future reminders for the selected person and exposes completed history without changing people', async () => {
    renderList();
    await screen.findByRole('link', { name: 'Future follow-up company' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'workspaceMemberId=selected-person',
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain('scope=scheduled');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Follow-up status' }),
      'completed',
    );
    await screen.findByRole('link', { name: 'Previously flagged company' });
    expect(
      screen.queryByRole('link', { name: 'Future follow-up company' }),
    ).not.toBeInTheDocument();
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'workspaceMemberId=selected-person',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Follow-up attribution' }),
      'assigned',
    );
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
        'scope=assigned',
      ),
    );
  });

  it('labels restricted companies and links to their full reminder queue without calling them unlinked', async () => {
    const hidden = group(false);
    hidden.company = null;
    hidden.companyStatus = 'restricted';
    hidden.reminders = hidden.reminders.map((reminder) => ({
      ...reminder,
      company: null,
      companyStatus: 'restricted',
    }));
    hidden.nextReminderCursor = 'more-reminders';
    fetchMock.mockResponseOnce(
      JSON.stringify({
        data: {
          status: 'available',
          records: [hidden],
          totalCount: 1,
          nextCursor: null,
        },
      }),
    );
    renderList();
    const title = await screen.findByText('Unavailable company');
    await userEvent.click(title.closest('summary')!);
    expect(screen.queryByText('Needs company link')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all reminders' }),
    ).toHaveAttribute('href', expect.stringContaining('companyId=restricted'));
  });

  it('retains the reminder and offers retry when completion fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Permission changed'));
    renderList();
    await screen.findByRole('link', { name: 'Future follow-up company' });
    await userEvent.click(
      screen.getByText('Future follow-up company').closest('summary')!,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not complete this follow-up',
    );
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
