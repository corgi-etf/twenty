import { useCorgiHomeEnabled } from '@/corgi-crm/home/hooks/useCorgiHomeEnabled';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RestLink } from 'apollo-link-rest';
import fetchMock from 'jest-fetch-mock';
import { type ReactNode } from 'react';

jest.mock('@/corgi-crm/home/hooks/useCorgiHomeEnabled', () => ({
  useCorgiHomeEnabled: jest.fn(),
}));

const Wrapper = ({ children }: { children: ReactNode }) => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new RestLink({
      uri: 'https://crm.example/rest',
      credentials: 'include',
    }),
  });
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};

describe('Corgi authenticated REST resource', () => {
  beforeEach(() => {
    fetchMock.enableMocks();
    fetchMock.resetMocks();
    jest.mocked(useCorgiHomeEnabled).mockReturnValue(true);
  });
  afterEach(() => fetchMock.disableMocks());
  it('preserves the complete typed payload while encoding filters and using the authenticated transport', async () => {
    const payload = {
      status: 'available',
      records: [{ label: 'A & B', amountMicros: '1000000' }],
      totalCount: 125,
      nextCursor: 'cursor',
    };
    fetchMock.mockResponseOnce(JSON.stringify({ data: payload }));
    const { result } = renderHook(
      () =>
        useCorgiHomeResource({ section: 'currentClients', search: 'A & B' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://crm.example/rest/corgi-crm/home?section=currentClients&search=A+%26+B',
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  it('isolates simultaneous sections and their refetches in the Apollo cache', async () => {
    fetchMock.mockResponse((request) =>
      Promise.resolve(
        JSON.stringify({
          data:
            new URL(request.url).searchParams.get('section') ===
            'currentClients'
              ? { records: ['client'], totalCount: 1 }
              : { enabled: true, today: { date: '2026-10-05' } },
        }),
      ),
    );
    const { result } = renderHook(
      () => ({
        summary: useCorgiHomeResource<{ enabled: boolean }>(),
        clients: useCorgiHomeResource<{ records: string[] }>({
          section: 'currentClients',
        }),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.summary.data).toMatchObject({ enabled: true });
      expect(result.current.clients.data).toMatchObject({
        records: ['client'],
      });
    });
    await act(async () => {
      await result.current.clients.refetch();
    });
    expect(result.current.summary.data).toMatchObject({ enabled: true });
  });

  it('makes no CRM request in a workspace without the installed schema', () => {
    jest.mocked(useCorgiHomeEnabled).mockReturnValue(false);
    renderHook(() => useCorgiHomeResource(), { wrapper: Wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
