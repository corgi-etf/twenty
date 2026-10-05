import { CorgiLegacyFollowUps } from '@/corgi-crm/home/components/CorgiLegacyFollowUps';
import { type CorgiLegacyFollowUp } from '@/corgi-crm/types/CorgiHome';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestLink } from 'apollo-link-rest';
import fetchMock from 'jest-fetch-mock';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/corgi-crm/home/components/CorgiHomeProvider', () => ({
  useCorgiHome: () => ({ revision: 0 }),
}));
jest.mock('@/corgi-crm/home/hooks/useCorgiHomeEnabled', () => ({
  useCorgiHomeEnabled: () => true,
}));

const record: CorgiLegacyFollowUp = {
  activity: {
    id: 'activity',
    label: 'Earlier outreach',
    objectNameSingular: 'outreachActivity',
    objectNamePlural: 'outreachActivities',
  },
  task: {
    id: 'task',
    label: 'Call next quarter',
    objectNameSingular: 'task',
    objectNamePlural: 'tasks',
  },
  company: {
    id: 'company',
    label: 'Future client',
    objectNameSingular: 'company',
    objectNamePlural: 'companies',
  },
  dueAt: '2027-01-05T15:00:00Z',
  followUpDate: '2027-02-01',
  status: 'TODO',
  schedulerStatus: 'unknown',
};

const renderList = (workspaceMemberId?: string) =>
  render(
    <ApolloProvider
      client={
        new ApolloClient({
          cache: new InMemoryCache(),
          link: new RestLink({ uri: 'https://crm.example/rest' }),
        })
      }
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <CorgiLegacyFollowUps workspaceMemberId={workspaceMemberId} />
        </MemoryRouter>
      </I18nProvider>
    </ApolloProvider>,
  );

describe('Legacy follow-up history', () => {
  beforeEach(() => {
    fetchMock.enableMocks();
    fetchMock.resetMocks();
  });
  afterEach(() => fetchMock.disableMocks());

  it('retains selected-person attribution through paging and completed history, while preferring the original task due date', async () => {
    fetchMock.mockResponse((request) => {
      const params = new URL(request.url).searchParams;
      const completed = params.get('status') === 'completed';
      const secondPage = params.has('cursor');
      return Promise.resolve(
        JSON.stringify({
          data: {
            status: 'available',
            records: [
              {
                ...record,
                status: completed ? 'DONE' : 'TODO',
                company: {
                  ...record.company,
                  id: secondPage ? 'second-company' : 'company',
                  label: completed
                    ? 'Completed client'
                    : secondPage
                      ? 'Second client'
                      : 'Future client',
                },
              },
            ],
            totalCount: completed ? 1 : 26,
            nextCursor: secondPage || completed ? null : 'opaque-page-two',
          },
        }),
      );
    });
    renderList('selected-person');
    await screen.findByRole('link', { name: 'Future client' });
    expect(screen.getByText(/Original scheduler unknown/)).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Legacy follow-up assignment' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/2027-02-01/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Earlier outreach' }),
    ).toHaveAttribute('href', '/object/outreachActivity/activity');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('link', { name: 'Second client' });
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'cursor=opaque-page-two',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Legacy follow-up status' }),
      'completed',
    );
    await screen.findByRole('link', { name: 'Completed client' });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toContain('workspaceMemberId=selected-person');
      expect(String(url)).toContain('legacyScope=assigned');
    }
  });

  it('keeps unlinked and inaccessible earlier tasks in a separately labelled shared queue', async () => {
    fetchMock.mockResponse((request) => {
      const shared =
        new URL(request.url).searchParams.get('legacyScope') === 'unassigned';
      return Promise.resolve(
        JSON.stringify({
          data: {
            status: 'available',
            records: shared
              ? [
                  {
                    ...record,
                    task: null,
                    taskAvailability: 'restricted',
                    company: null,
                    companyStatus: 'restricted',
                    status: null,
                    dueAt: null,
                  },
                ]
              : [],
            totalCount: shared ? 1 : 0,
            nextCursor: null,
          },
        }),
      );
    });
    renderList();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Legacy follow-up assignment' }),
      'unassigned',
    );
    await screen.findByText('Task unavailable');
    expect(screen.getByText('Unavailable company')).toBeInTheDocument();
    expect(screen.getByText(/Activity follow-up date/)).toHaveTextContent(
      '2027-02-01',
    );
    expect(screen.getByText(/Original scheduler unknown/)).toBeInTheDocument();
    expect(screen.queryByText('Needs company link')).not.toBeInTheDocument();
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).not.toContain(
      'workspaceMemberId',
    );
  });
});
