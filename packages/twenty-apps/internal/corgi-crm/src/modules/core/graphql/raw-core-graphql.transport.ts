export type RawCoreGraphqlRequest<TVariables extends Record<string, unknown>> = {
  operationName: string;
  document: string;
  variables: TVariables;
};

export type RawCoreGraphqlTransportOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export const RAW_CORE_GRAPHQL_ERROR_CATEGORIES = [
  'configuration',
  'transport',
  'timeout',
  'http',
  'permission_denied',
  'schema_mismatch',
  'constraint_conflict',
  'graphql',
  'malformed_response',
] as const;

export type RawCoreGraphqlErrorCategory =
  (typeof RAW_CORE_GRAPHQL_ERROR_CATEGORIES)[number];

const extensionCodeByCategory: Record<RawCoreGraphqlErrorCategory, string> = {
  configuration: 'RAW_CORE_CONFIGURATION',
  transport: 'NETWORK_ERROR',
  timeout: 'TIMEOUT',
  http: 'HTTP_ERROR',
  permission_denied: 'PERMISSION_DENIED',
  schema_mismatch: 'GRAPHQL_VALIDATION_FAILED',
  constraint_conflict: 'CONFLICT',
  graphql: 'GRAPHQL_ERROR',
  malformed_response: 'MALFORMED_RESPONSE',
};

const safeReasonByCategory: Record<RawCoreGraphqlErrorCategory, string> = {
  configuration: 'configuration',
  transport: 'network',
  timeout: 'timeout',
  http: 'HTTP',
  permission_denied: 'permission denied',
  schema_mismatch: 'GraphQL validation',
  constraint_conflict: 'conflict',
  graphql: 'GraphQL',
  malformed_response: 'malformed response',
};

export class RawCoreGraphqlError extends Error {
  public readonly extensions: { code: string };

  public constructor(
    public readonly category: RawCoreGraphqlErrorCategory,
    public readonly operationName: string,
  ) {
    super(
      `Core GraphQL operation ${operationName} failed (${safeReasonByCategory[category]})`,
    );
    this.name = 'RawCoreGraphqlError';
    this.extensions = { code: extensionCodeByCategory[category] };
  }
}

type GraphqlError = { extensions?: { code?: unknown } };
type GraphqlPayload = { data?: unknown; errors?: unknown };

const DEFAULT_TIMEOUT_MS = 10_000;
const GRAPHQL_NAME_PATTERN = /^[_A-Za-z][_0-9A-Za-z]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const endpointFrom = (
  env: Record<string, string | undefined>,
  operationName: string,
): string => {
  const configured = env.TWENTY_API_URL?.trim();
  if (!configured) {
    throw new RawCoreGraphqlError('configuration', operationName);
  }
  try {
    const endpoint = new URL(configured);
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error('unsafe URL');
    }
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/graphql`;
    return endpoint.toString();
  } catch {
    throw new RawCoreGraphqlError('configuration', operationName);
  }
};

const tokenFrom = (
  env: Record<string, string | undefined>,
  operationName: string,
): string => {
  const token =
    env.TWENTY_APP_ACCESS_TOKEN?.trim() || env.TWENTY_API_KEY?.trim();
  if (!token) {
    throw new RawCoreGraphqlError('configuration', operationName);
  }
  return token;
};

const categoryFromGraphqlErrors = (
  errors: GraphqlError[],
): RawCoreGraphqlErrorCategory => {
  const codes = errors
    .map((error) => error.extensions?.code)
    .filter((code): code is string => typeof code === 'string')
    .map((code) => code.toUpperCase());
  if (
    codes.some((code) =>
      ['FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(code),
    )
  ) {
    return 'permission_denied';
  }
  if (codes.includes('GRAPHQL_VALIDATION_FAILED')) return 'schema_mismatch';
  if (
    codes.some((code) =>
      [
        'CONFLICT',
        'QUERY_VIOLATES_UNIQUE_CONSTRAINT',
        'CONNECT_UNIQUE_CONSTRAINT_ERROR',
      ].includes(code),
    )
  ) {
    return 'constraint_conflict';
  }
  return 'graphql';
};

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (isRecord(error) && error.name === 'AbortError');

export class RawCoreGraphqlTransport {
  private readonly env: Record<string, string | undefined>;
  private readonly fetchImplementation: typeof globalThis.fetch | undefined;
  private readonly timeoutMs: number;

  public constructor(options: RawCoreGraphqlTransportOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async request<
    TData,
    TVariables extends Record<string, unknown>,
  >({
    operationName,
    document,
    variables,
  }: RawCoreGraphqlRequest<TVariables>): Promise<TData> {
    if (
      !GRAPHQL_NAME_PATTERN.test(operationName) ||
      !document.trim() ||
      !isRecord(variables) ||
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0
    ) {
      throw new RawCoreGraphqlError('configuration', 'InvalidOperation');
    }
    const endpoint = endpointFrom(this.env, operationName);
    const token = tokenFrom(this.env, operationName);
    if (!this.fetchImplementation) {
      throw new RawCoreGraphqlError('configuration', operationName);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operationName, query: document, variables }),
          signal: abortController.signal,
        });
      } catch (error) {
        throw new RawCoreGraphqlError(
          isAbortError(error) ? 'timeout' : 'transport',
          operationName,
        );
      }

      if (!response.ok) {
        const category =
          response.status === 401 || response.status === 403
            ? 'permission_denied'
            : response.status === 409
              ? 'constraint_conflict'
              : 'http';
        throw new RawCoreGraphqlError(category, operationName);
      }

      let rawBody: string;
      try {
        rawBody = await response.text();
      } catch (error) {
        throw new RawCoreGraphqlError(
          isAbortError(error) ? 'timeout' : 'transport',
          operationName,
        );
      }
      let payload: GraphqlPayload;
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (!isRecord(parsed)) throw new Error('not an object');
        payload = parsed;
      } catch {
        throw new RawCoreGraphqlError('malformed_response', operationName);
      }
      if (payload.errors !== undefined) {
        if (!Array.isArray(payload.errors) || payload.errors.length === 0) {
          throw new RawCoreGraphqlError('malformed_response', operationName);
        }
        const errors = payload.errors.filter(isRecord) as GraphqlError[];
        if (errors.length !== payload.errors.length) {
          throw new RawCoreGraphqlError('malformed_response', operationName);
        }
        throw new RawCoreGraphqlError(
          categoryFromGraphqlErrors(errors),
          operationName,
        );
      }
      if (!isRecord(payload.data)) {
        throw new RawCoreGraphqlError('malformed_response', operationName);
      }
      return payload.data as TData;
    } finally {
      clearTimeout(timeout);
    }
  }
}
