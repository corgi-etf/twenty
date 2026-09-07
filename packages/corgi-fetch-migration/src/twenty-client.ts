export type FetchLike = typeof fetch;

export class TwentyApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export class TwentyClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl: FetchLike;
  readonly maxAttempts: number;

  constructor(
    baseUrl: string,
    apiKey: string,
    fetchImpl: FetchLike = fetch,
    maxAttempts = 4,
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.maxAttempts = maxAttempts;
  }

  async request<T>(_path: string, _init: RequestInit = {}): Promise<T> {
    const path = _path;
    const init = _init;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const signal = init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000);
        const response = await this.fetchImpl(
          new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`),
          {
            ...init,
            signal,
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${this.apiKey}`,
              ...(init.body ? { 'content-type': 'application/json' } : {}),
              ...init.headers,
            },
          },
        );
        const retryable = response.status === 429 || response.status >= 500;

        if (!response.ok) {
          const body = (await response.text()).slice(0, 500);
          const error = new TwentyApiError(
            `Twenty API ${response.status} for ${path}: ${body}`,
            response.status,
          );

          if (!retryable || attempt === this.maxAttempts) throw error;
          lastError = error;
          const retryAfter = Number(response.headers.get('retry-after'));
          const delay = Number.isFinite(retryAfter)
            ? Math.min(retryAfter * 1_000, 5_000)
            : Math.min(50 * 2 ** (attempt - 1), 1_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (response.status === 204) return undefined as T;

        return (await response.json()) as T;
      } catch (error) {
        const isTimeout =
          error instanceof DOMException &&
          (error.name === 'AbortError' || error.name === 'TimeoutError');

        if (
          !isTimeout ||
          error instanceof TwentyApiError ||
          attempt === this.maxAttempts
        ) {
          throw error;
        }
        lastError = error;
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * 2 ** (attempt - 1)),
        );
      }
    }

    throw lastError ?? new Error(`Twenty API request failed for ${path}`);
  }
}
