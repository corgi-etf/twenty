import { APPROVED_CRM_ORIGIN } from './constants.ts';
import type { LegacyCrmHolding } from './legacy-migration.ts';

export type TwentyImportClientOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  origin: string;
  sleep?: (milliseconds: number) => Promise<void>;
  token: string;
};

const API_REQUEST_INTERVAL_MILLISECONDS = 650;
const MAX_API_REQUEST_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RETRY_AFTER_MILLISECONDS = 60_000;

export class TwentyImportClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly origin: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly token: string;
  private nextRequestAt = 0;

  constructor(options: TwentyImportClientOptions) {
    if (options.origin !== APPROVED_CRM_ORIGIN) {
      throw new Error('CRM origin is not approved');
    }
    if (!options.token || options.token.length > 16_384) {
      throw new Error('CRM read credential is invalid');
    }
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.origin = options.origin;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.token = options.token;
  }

  async listHoldings(): Promise<LegacyCrmHolding[]> {
    const rows: LegacyCrmHolding[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 1_000; page += 1) {
      const url = new URL('/rest/thirteenFHoldings', this.origin);
      url.searchParams.set('limit', '100');
      url.searchParams.set('depth', '1');
      if (cursor) url.searchParams.set('starting_after', cursor);
      const body = await this.getJson(url);
      const data = isRecord(body) && isRecord(body.data) ? body.data : null;
      const pageRows = data?.thirteenFHoldings;
      if (
        !Array.isArray(pageRows) ||
        pageRows.some(
          (row) => !isRecord(row) || typeof row.id !== 'string' || !row.id,
        )
      ) {
        throw new Error('CRM holdings response is invalid');
      }
      rows.push(...(pageRows as LegacyCrmHolding[]));
      const pageInfo =
        isRecord(body) && isRecord(body.pageInfo) ? body.pageInfo : null;
      if (pageInfo?.hasNextPage !== true) return rows;
      const nextCursor = pageInfo.endCursor;
      if (
        typeof nextCursor !== 'string' ||
        !nextCursor ||
        seenCursors.has(nextCursor)
      ) {
        throw new Error('CRM holdings pagination is invalid');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('CRM holdings pagination exceeded its hard limit');
  }

  private async getJson(url: URL): Promise<unknown> {
    for (let attempt = 1; attempt <= MAX_API_REQUEST_ATTEMPTS; attempt += 1) {
      const waitMilliseconds = Math.max(0, this.nextRequestAt - this.now());
      if (waitMilliseconds > 0) await this.sleep(waitMilliseconds);
      this.nextRequestAt = this.now() + API_REQUEST_INTERVAL_MILLISECONDS;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.token}`,
            Origin: this.origin,
          },
          redirect: 'error',
        });
      } catch {
        throw new Error('CRM holdings request failed');
      }
      if (response.status === 429 && attempt < MAX_API_REQUEST_ATTEMPTS) {
        const retryAfter = retryAfterMilliseconds(
          response.headers.get('retry-after'),
        );
        await response.body?.cancel();
        this.nextRequestAt = Math.max(
          this.nextRequestAt,
          this.now() + retryAfter,
        );
        continue;
      }
      if (!response.ok) throw new Error('CRM holdings request failed');
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new Error('CRM holdings response is too large');
      }
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new Error('CRM holdings response is invalid');
      }
    }
    throw new Error('CRM holdings request failed');
  }
}

const retryAfterMilliseconds = (value: string | null): number => {
  const seconds = value && /^[0-9]+$/.test(value) ? Number(value) : 1;

  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MILLISECONDS);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
