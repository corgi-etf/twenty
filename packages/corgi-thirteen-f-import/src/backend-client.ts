import { createHash } from 'node:crypto';

import type {
  CompletedIngestionReceipt,
  IngestionExpectedCounts,
  NormalizedDataset,
} from './ingestion-contract.ts';

const APPROVED_BACKEND_ORIGIN = 'https://admin.corgiinvest.com';
const MAX_CHUNK_ITEMS = 500;
const MAX_CHUNKS = 100;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

type BackendIngestionClientOptions = {
  origin: string;
  token: string;
  fetcher?: typeof fetch;
};

type TaggedItem =
  | { kind: 'managers'; value: NormalizedDataset['managers'][number] }
  | { kind: 'filings'; value: NormalizedDataset['filings'][number] }
  | { kind: 'securities'; value: NormalizedDataset['securities'][number] }
  | { kind: 'holdings'; value: NormalizedDataset['holdings'][number] };

type IngestionChunk = NormalizedDataset;

const normalizeForJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeForJson(child)]),
    );
  }

  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(normalizeForJson(value));

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const chunksFor = (
  dataset: NormalizedDataset,
  chunkSize: number,
): IngestionChunk[] => {
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > MAX_CHUNK_ITEMS
  ) {
    throw new Error('Backend ingestion chunk size is invalid');
  }
  const tagged: TaggedItem[] = [
    ...dataset.managers.map((value) => ({ kind: 'managers', value }) as const),
    ...dataset.filings.map((value) => ({ kind: 'filings', value }) as const),
    ...dataset.securities.map(
      (value) => ({ kind: 'securities', value }) as const,
    ),
    ...dataset.holdings.map((value) => ({ kind: 'holdings', value }) as const),
  ];
  const chunks: IngestionChunk[] = [];
  for (let index = 0; index < tagged.length; index += chunkSize) {
    const chunk: IngestionChunk = {
      managers: [],
      filings: [],
      securities: [],
      holdings: [],
    };
    for (const item of tagged.slice(index, index + chunkSize)) {
      (chunk[item.kind] as unknown[]).push(item.value);
    }
    chunks.push(chunk);
  }
  if (chunks.length < 1 || chunks.length > MAX_CHUNKS) {
    throw new Error('Backend ingestion exceeds the batch chunk limit');
  }

  return chunks;
};

const expectedCounts = (
  dataset: NormalizedDataset,
  chunks: number,
): IngestionExpectedCounts => ({
  managers: dataset.managers.length,
  filings: dataset.filings.length,
  securities: dataset.securities.length,
  holdings: dataset.holdings.length,
  chunks,
});

export class BackendIngestionClient {
  private readonly fetcher: typeof fetch;
  private readonly origin: string;
  private readonly token: string;

  constructor(options: BackendIngestionClientOptions) {
    if (options.origin !== APPROVED_BACKEND_ORIGIN) {
      throw new Error('13F backend origin is not approved');
    }
    if (!options.token || options.token.length > 16_384) {
      throw new Error('13F backend credential is invalid');
    }
    this.fetcher = options.fetcher ?? fetch;
    this.origin = options.origin;
    this.token = options.token;
  }

  async ingestLegacyDataset(input: {
    batchKey: string;
    dataset: NormalizedDataset;
    chunkSize?: number;
  }): Promise<CompletedIngestionReceipt> {
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(input.batchKey)) {
      throw new Error('Backend ingestion batch key is invalid');
    }
    const chunks = chunksFor(input.dataset, input.chunkSize ?? 400);
    const expected = expectedCounts(input.dataset, chunks.length);
    const contentSha256 = sha256(canonicalJson(input.dataset));
    await this.post(`${input.batchKey}/begin`, {
      sourceSystem: 'LEGACY_NORMALIZED',
      coverage: 'PARTIAL',
      contentSha256,
      expected,
    });
    for (const [sequence, chunk] of chunks.entries()) {
      await this.post(`${input.batchKey}/chunks`, {
        sequence,
        chunkSha256: sha256(canonicalJson(chunk)),
        ...chunk,
      });
    }
    const completed = await this.post(`${input.batchKey}/complete`, {
      contentSha256,
      expected,
    });
    if (
      !isRecord(completed) ||
      completed.status !== 'COMPLETED' ||
      completed.batchKey !== input.batchKey ||
      typeof completed.batchId !== 'string' ||
      typeof completed.completedAt !== 'string' ||
      !isCounts(completed.receivedCounts) ||
      !isCounts(completed.published)
    ) {
      throw new Error('Backend ingestion completion response is invalid');
    }

    return completed as CompletedIngestionReceipt;
  }

  private async post(path: string, value: unknown): Promise<unknown> {
    const body = canonicalJson(value);
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) {
      throw new Error('Backend ingestion request is too large');
    }
    let response: Response;
    try {
      response = await this.fetcher(
        new URL(`/api/internal/thirteen-f/ingestions/${path}`, this.origin),
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body,
          redirect: 'error',
        },
      );
    } catch {
      throw new Error('Backend ingestion request failed');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Backend ingestion request failed with ${response.status}`,
      );
    }
    const responseBody = await response.text();
    if (Buffer.byteLength(responseBody, 'utf8') > 1024 * 1024) {
      throw new Error('Backend ingestion response is too large');
    }
    try {
      return JSON.parse(responseBody) as unknown;
    } catch {
      throw new Error('Backend ingestion response is invalid');
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCounts = (value: unknown): boolean =>
  isRecord(value) &&
  ['managers', 'filings', 'securities', 'holdings'].every(
    (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
  );
