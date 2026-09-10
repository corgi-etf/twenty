import { describe, expect, it, vi } from 'vitest';

import {
  RawCoreGraphqlError,
  RawCoreGraphqlTransport,
} from 'src/modules/core/graphql/raw-core-graphql.transport';

const request = {
  operationName: 'ReadWholesalers',
  document:
    'query ReadWholesalers($first: Int!) { wholesalers(first: $first) { edges { node { id } } } }',
  variables: { first: 3 },
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Failure',
    headers: { 'content-type': 'application/json' },
  });

describe('RawCoreGraphqlTransport', () => {
  it('lazily uses the delegated app token and trusted runtime URL', async () => {
    const env: Record<string, string | undefined> = {};
    const fetch = vi.fn(async () =>
      response({ data: { wholesalers: { edges: [] } } }),
    );
    const transport = new RawCoreGraphqlTransport({ env, fetch });
    env.TWENTY_API_URL = 'https://crm.example.test/base';
    env.TWENTY_APP_ACCESS_TOKEN = 'delegated-token';
    env.TWENTY_API_KEY = 'legacy-token';

    await expect(
      transport.request<{ wholesalers: { edges: unknown[] } }, { first: number }>(
        request,
      ),
    ).resolves.toEqual({ wholesalers: { edges: [] } });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://crm.example.test/base/graphql');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer delegated-token');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      operationName: request.operationName,
      query: request.document,
      variables: request.variables,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to the injected application API key without storing a token', async () => {
    const fetch = vi.fn(async () => response({ data: { ok: true } }));
    const env = {
      TWENTY_API_URL: 'https://crm.example.test',
      TWENTY_API_KEY: 'application-token',
    };
    const transport = new RawCoreGraphqlTransport({ env, fetch });

    await expect(
      transport.request<{ ok: boolean }, Record<string, never>>({
        operationName: 'HealthCheck',
        document: 'query HealthCheck { currentWorkspace { id } }',
        variables: {},
      }),
    ).resolves.toEqual({ ok: true });
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('authorization')).toBe(
      'Bearer application-token',
    );
  });

  it.each([
    [
      { errors: [{ message: 'private@example.test', extensions: { code: 'FORBIDDEN' } }] },
      'permission_denied',
    ],
    [
      {
        errors: [
          {
            message: 'Cannot query field privateField',
            extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
          },
        ],
      },
      'schema_mismatch',
    ],
    [
      { errors: [{ message: 'private duplicate', extensions: { code: 'CONFLICT' } }] },
      'constraint_conflict',
    ],
    [{ errors: [{ message: 'private internal value' }] }, 'graphql'],
  ] as const)(
    'classifies GraphQL failures as %s without exposing response data',
    async (body, category) => {
      const transport = new RawCoreGraphqlTransport({
        env: {
          TWENTY_API_URL: 'https://crm.example.test',
          TWENTY_APP_ACCESS_TOKEN: 'private-token',
        },
        fetch: vi.fn(async () => response(body)),
      });

      const error = await transport.request(request).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(RawCoreGraphqlError);
      expect(error).toMatchObject({ category, operationName: request.operationName });
      expect((error as Error).message).not.toMatch(
        /private|example\.test|token|duplicate|internal value/i,
      );
    },
  );

  it.each([
    [{ TWENTY_APP_ACCESS_TOKEN: 'secret' }, 'configuration'],
    [
      {
        TWENTY_API_URL: 'https://user:password@crm.example.test',
        TWENTY_APP_ACCESS_TOKEN: 'secret',
      },
      'configuration',
    ],
    [{ TWENTY_API_URL: 'https://crm.example.test' }, 'configuration'],
  ] as const)(
    'fails before fetch for missing or unsafe runtime configuration',
    async (env, category) => {
      const fetch = vi.fn();
      const transport = new RawCoreGraphqlTransport({ env, fetch });

      const error = await transport.request(request).catch((value: unknown) => value);
      expect(error).toMatchObject({ category });
      expect(fetch).not.toHaveBeenCalled();
      expect((error as Error).message).not.toMatch(/secret|password|example\.test/i);
    },
  );

  it('fails safely on HTTP, malformed JSON, and missing GraphQL data', async () => {
    const bodies = [
      new Response('private server body', { status: 503, statusText: 'Unavailable' }),
      new Response('not json', { status: 200 }),
      response({ extensions: { private: 'value' } }),
    ];
    const fetch = vi.fn(async () => bodies.shift()!);
    const transport = new RawCoreGraphqlTransport({
      env: {
        TWENTY_API_URL: 'https://crm.example.test',
        TWENTY_APP_ACCESS_TOKEN: 'secret',
      },
      fetch,
    });

    for (const category of ['http', 'malformed_response', 'malformed_response']) {
      const error = await transport.request(request).catch((value: unknown) => value);
      expect(error).toMatchObject({ category });
      expect((error as Error).message).not.toMatch(/private|server body|value/i);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('aborts once at the configured bound without retrying', async () => {
    const fetch = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('private timeout detail', 'AbortError')),
          );
        }),
    );
    const transport = new RawCoreGraphqlTransport({
      env: {
        TWENTY_API_URL: 'https://crm.example.test',
        TWENTY_APP_ACCESS_TOKEN: 'secret',
      },
      fetch,
      timeoutMs: 1,
    });

    const error = await transport.request(request).catch((value: unknown) => value);
    expect(error).toMatchObject({ category: 'timeout' });
    expect(fetch).toHaveBeenCalledOnce();
    expect((error as Error).message).not.toMatch(/private|detail|secret/i);
  });

  it('classifies an injected fetch rejection as transport without retrying', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('private socket address');
    });
    const transport = new RawCoreGraphqlTransport({
      env: {
        TWENTY_API_URL: 'https://crm.example.test',
        TWENTY_APP_ACCESS_TOKEN: 'secret',
      },
      fetch,
    });

    const error = await transport.request(request).catch((value: unknown) => value);
    expect(error).toMatchObject({ category: 'transport' });
    expect(fetch).toHaveBeenCalledOnce();
    expect((error as Error).message).not.toMatch(/private|socket|secret/i);
  });
});
