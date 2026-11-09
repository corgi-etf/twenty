import type {
  CrmFileValue,
  FilingCreateInput,
  ThirteenFFilingRecord,
  ThirteenFImportApi,
  UploadReservation,
} from './importer.ts';
import type {
  ExistingImportRun,
  HoldingsImportApi,
} from './holdings-importer.ts';
import {
  APPROVED_CRM_ORIGIN,
  MAX_SOURCE_FILE_BYTES,
  THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
} from './constants.ts';

export type TwentyImportClientOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  origin: string;
  sleep?: (milliseconds: number) => Promise<void>;
  token: string;
};

const API_REQUEST_INTERVAL_MILLISECONDS = 650;
const MAX_API_REQUEST_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MILLISECONDS = 60_000;

const HOLDINGS_OBJECT_PLURALS = new Set([
  'thirteenFManagers',
  'thirteenFSecurities',
  'thirteenFHoldings',
  'thirteenFImportRuns',
  'thirteenFImportErrors',
]);

export class TwentyImportClient
  implements ThirteenFImportApi, HoldingsImportApi
{
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly origin: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly token: string;
  private nextApiRequestAtMilliseconds = 0;
  private requestTail: Promise<void> = Promise.resolve();

  constructor(options: TwentyImportClientOptions) {
    if (options.origin !== APPROVED_CRM_ORIGIN) {
      throw new Error('CRM origin is not approved');
    }
    if (!options.token || options.token.length > 16_384) {
      throw new Error('CRM import credential is invalid');
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

  async listFilings(): Promise<ThirteenFFilingRecord[]> {
    const records: ThirteenFFilingRecord[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 1_000; page += 1) {
      const url = new URL('/rest/thirteenFFilings', this.origin);
      url.searchParams.set('limit', '100');
      url.searchParams.set('depth', '1');
      if (cursor) url.searchParams.set('starting_after', cursor);
      const body = await this.authenticatedJsonRequest(
        url,
        { method: 'GET' },
        'CRM filing list',
      );
      const data = isRecord(body) && isRecord(body.data) ? body.data : null;
      const pageRecords = data?.thirteenFFilings;
      if (
        !Array.isArray(pageRecords) ||
        pageRecords.some(
          (record) => !isRecord(record) || typeof record.id !== 'string',
        )
      ) {
        throw new Error('CRM filing list response is invalid');
      }
      records.push(...(pageRecords as ThirteenFFilingRecord[]));
      const pageInfo =
        isRecord(body) && isRecord(body.pageInfo) ? body.pageInfo : null;
      if (pageInfo?.hasNextPage !== true) return records;
      const nextCursor = pageInfo.endCursor;
      if (
        typeof nextCursor !== 'string' ||
        !nextCursor ||
        seenCursors.has(nextCursor)
      ) {
        throw new Error('CRM filing pagination is invalid');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('CRM filing pagination exceeded its hard limit');
  }

  async findImportRun(
    importKey: string,
  ): Promise<ExistingImportRun | undefined> {
    if (!/^[a-f0-9]{64}$/.test(importKey)) {
      throw new Error('13F import key is invalid');
    }
    const url = new URL('/rest/thirteenFImportRuns', this.origin);
    url.searchParams.set(
      'filter',
      `importKey[eq]:${JSON.stringify(importKey)}`,
    );
    url.searchParams.set('limit', '2');
    url.searchParams.set('depth', '0');
    const body = await this.authenticatedJsonRequest(
      url,
      { method: 'GET' },
      'CRM import-run lookup',
    );
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const records = data?.thirteenFImportRuns;
    if (
      !Array.isArray(records) ||
      records.some(
        (record) =>
          !isRecord(record) ||
          typeof record.id !== 'string' ||
          record.importKey !== importKey,
      ) ||
      records.length > 1
    ) {
      throw new Error('CRM import-run lookup response is invalid');
    }

    return records[0] as ExistingImportRun | undefined;
  }

  async listHoldingIds(filter: string): Promise<string[]> {
    if (!filter || filter.length > 4096) {
      throw new Error('CRM holdings list filter is invalid');
    }
    const ids: string[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 1_000; page += 1) {
      const url = new URL('/rest/thirteenFHoldings', this.origin);
      url.searchParams.set('filter', filter);
      url.searchParams.set('limit', '100');
      url.searchParams.set('depth', '0');
      url.searchParams.set('fields', 'id');
      if (cursor) url.searchParams.set('starting_after', cursor);
      const body = await this.authenticatedJsonRequest(
        url,
        { method: 'GET' },
        'CRM holdings ID list',
      );
      const data = isRecord(body) && isRecord(body.data) ? body.data : null;
      const records = data?.thirteenFHoldings;
      if (
        !Array.isArray(records) ||
        records.some(
          (record) => !isRecord(record) || typeof record.id !== 'string',
        )
      ) {
        throw new Error('CRM holdings ID list response is invalid');
      }
      ids.push(
        ...records.map((record) => String((record as { id: string }).id)),
      );
      const pageInfo =
        isRecord(body) && isRecord(body.pageInfo) ? body.pageInfo : null;
      if (pageInfo?.hasNextPage !== true) return ids;
      const nextCursor = pageInfo.endCursor;
      if (
        typeof nextCursor !== 'string' ||
        !nextCursor ||
        seenCursors.has(nextCursor)
      ) {
        throw new Error('CRM holdings ID pagination is invalid');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('CRM holdings ID pagination exceeded its hard limit');
  }

  async upsertBatch(
    objectPlural: string,
    records: readonly Record<string, unknown>[],
  ): Promise<void> {
    if (
      !HOLDINGS_OBJECT_PLURALS.has(objectPlural) ||
      records.length < 1 ||
      records.length > 100
    ) {
      throw new Error('CRM holdings batch is invalid');
    }
    const body = JSON.stringify(records);
    if (Buffer.byteLength(body, 'utf8') > 8 * 1024 * 1024) {
      throw new Error('CRM holdings batch is too large');
    }
    const url = new URL(
      `/rest/batch/${encodeURIComponent(objectPlural)}`,
      this.origin,
    );
    url.searchParams.set('upsert', 'true');
    url.searchParams.set('depth', '0');
    await this.authenticatedJsonRequest(
      url,
      { method: 'POST', body },
      `CRM ${objectPlural} upsert`,
    );
  }

  async patchMany(
    objectPlural: string,
    filter: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    if (
      !HOLDINGS_OBJECT_PLURALS.has(objectPlural) ||
      !filter ||
      filter.length > 4096 ||
      Object.keys(data).length < 1
    ) {
      throw new Error('CRM holdings bulk update is invalid');
    }
    const url = new URL(
      `/rest/${encodeURIComponent(objectPlural)}`,
      this.origin,
    );
    url.searchParams.set('filter', filter);
    url.searchParams.set('depth', '0');
    const body = await this.authenticatedJsonRequest(
      url,
      { method: 'PATCH', body: JSON.stringify(data) },
      `CRM ${objectPlural} bulk update`,
    );
    const responseData =
      isRecord(body) && isRecord(body.data) ? body.data : null;
    const responseKey = `update${objectPlural.charAt(0).toUpperCase()}${objectPlural.slice(1)}`;
    const updated = responseData?.[responseKey];
    if (!Array.isArray(updated)) {
      throw new Error('CRM holdings bulk update response is invalid');
    }

    return updated.length;
  }

  async createFiling(data: FilingCreateInput): Promise<ThirteenFFilingRecord> {
    const url = new URL('/rest/thirteenFFilings', this.origin);
    url.searchParams.set('depth', '1');
    const body = await this.authenticatedJsonRequest(
      url,
      { method: 'POST', body: JSON.stringify(data) },
      'CRM filing create',
    );
    const record =
      isRecord(body) && isRecord(body.data)
        ? body.data.createThirteenFFiling
        : undefined;
    if (!isRecord(record) || typeof record.id !== 'string') {
      throw new Error('CRM filing create response is invalid');
    }

    return record as ThirteenFFilingRecord;
  }

  async patchFiling(
    recordId: string,
    data: Partial<FilingCreateInput>,
  ): Promise<void> {
    assertUuid(recordId, 'CRM record ID');
    const url = new URL(
      `/rest/thirteenFFilings/${encodeURIComponent(recordId)}`,
      this.origin,
    );
    url.searchParams.set('depth', '1');
    const body = await this.authenticatedJsonRequest(
      url,
      { method: 'PATCH', body: JSON.stringify(data) },
      'CRM filing update',
    );
    const updated =
      isRecord(body) && isRecord(body.data)
        ? body.data.updateThirteenFFiling
        : undefined;
    if (!isRecord(updated) || updated.id !== recordId) {
      throw new Error('CRM filing update response is invalid');
    }
  }

  async createFileUpload(input: {
    filename: string;
    sizeBytes: number;
  }): Promise<UploadReservation> {
    if (
      !input.filename ||
      input.filename.length > 255 ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > MAX_SOURCE_FILE_BYTES
    ) {
      throw new Error('CRM file reservation input is invalid');
    }
    const body = await this.metadataRequest(
      'CorgiThirteenFCreateFileUpload',
      `mutation CorgiThirteenFCreateFileUpload(
        $filename: String!
        $size: Float!
        $fileFolder: FileFolder!
        $fieldMetadataUniversalIdentifier: String
      ) {
        createFileUpload(
          filename: $filename
          size: $size
          fileFolder: $fileFolder
          fieldMetadataUniversalIdentifier: $fieldMetadataUniversalIdentifier
        ) {
          fileId uploadUrl contentType expiresAt
        }
      }`,
      {
        filename: input.filename,
        size: input.sizeBytes,
        fileFolder: 'FilesField',
        fieldMetadataUniversalIdentifier:
          THIRTEEN_F_FILE_FIELD_UNIVERSAL_IDENTIFIER,
      },
    );
    const reservation = body.createFileUpload;
    if (
      !isRecord(reservation) ||
      typeof reservation.fileId !== 'string' ||
      typeof reservation.uploadUrl !== 'string' ||
      typeof reservation.contentType !== 'string' ||
      typeof reservation.expiresAt !== 'string'
    ) {
      throw new Error('CRM file reservation response is invalid');
    }
    assertUuid(reservation.fileId, 'CRM file ID');
    assertHttpsUrl(reservation.uploadUrl, 'CRM upload URL');
    if (reservation.contentType !== 'application/octet-stream') {
      throw new Error('CRM upload content type is invalid');
    }

    return reservation as UploadReservation;
  }

  async putFile(
    reservation: UploadReservation,
    bytes: Uint8Array,
  ): Promise<void> {
    assertUuid(reservation.fileId, 'CRM file ID');
    assertHttpsUrl(reservation.uploadUrl, 'CRM upload URL');
    if (
      reservation.contentType !== 'application/octet-stream' ||
      bytes.byteLength < 1 ||
      bytes.byteLength > MAX_SOURCE_FILE_BYTES
    ) {
      throw new Error('CRM upload input is invalid');
    }
    let response: Response;
    try {
      response = await this.fetcher(reservation.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': reservation.contentType },
        body: Buffer.from(bytes),
        redirect: 'error',
      });
    } catch {
      throw new Error('CRM file upload failed');
    }
    if (!response.ok) throw new Error('CRM file upload failed');
  }

  async completeFileUpload(
    fileId: string,
  ): Promise<'ready' | 'incomplete' | 'unknown'> {
    assertUuid(fileId, 'CRM file ID');
    const response = await this.rawMetadataRequest(
      'CorgiThirteenFCompleteFileUpload',
      `mutation CorgiThirteenFCompleteFileUpload($fileId: String!) {
        completeFileUpload(fileId: $fileId) { id size }
      }`,
      { fileId },
    );
    const messages = errorMessages(response);
    if (messages.some((message) => message.includes('has not been uploaded'))) {
      return 'incomplete';
    }
    if (messages.some((message) => message.includes('not found'))) {
      return 'unknown';
    }
    if (messages.length > 0) {
      throw new Error('CRM file completion failed');
    }
    const completed = isRecord(response.data)
      ? response.data.completeFileUpload
      : undefined;
    if (completed === null || completed === undefined) return 'unknown';
    if (!isRecord(completed) || completed.id !== fileId) {
      throw new Error('CRM file completion response is invalid');
    }

    return 'ready';
  }

  async attachFile(input: {
    recordId: string;
    fileId: string;
    label: string;
  }): Promise<'attached' | 'pending' | 'missing'> {
    assertUuid(input.recordId, 'CRM record ID');
    assertUuid(input.fileId, 'CRM file ID');
    const url = new URL(
      `/rest/thirteenFFilings/${encodeURIComponent(input.recordId)}`,
      this.origin,
    );
    url.searchParams.set('depth', '1');
    const response = await this.authenticatedRequest(
      url,
      {
        method: 'PATCH',
        body: JSON.stringify({
          file: [{ fileId: input.fileId, label: input.label }],
          importPendingFileId: null,
        }),
      },
      'CRM attachment request',
    );
    const body = await readJsonResponse(response, 256 * 1024, {
      allowErrorStatus: true,
      operation: 'CRM attachment request',
    });
    if (!response.ok) {
      const messages = deepStrings(body);
      if (
        messages.some((message) =>
          message.includes('upload has not been completed'),
        )
      ) {
        return 'pending';
      }
      if (messages.some((message) => message.includes('File not found:'))) {
        return 'missing';
      }
      throw new Error('CRM attachment request failed');
    }
    const updated =
      isRecord(body) && isRecord(body.data)
        ? body.data.updateThirteenFFiling
        : undefined;
    if (!isRecord(updated) || updated.id !== input.recordId) {
      throw new Error('CRM attachment response is invalid');
    }

    return 'attached';
  }

  async downloadAttachedFile(file: CrmFileValue): Promise<Uint8Array> {
    assertUuid(file.fileId, 'CRM file ID');
    if (!file.url) throw new Error('CRM attached file URL is invalid');
    let url: URL;
    try {
      url = new URL(file.url);
    } catch {
      throw new Error('CRM attached file URL is invalid');
    }
    if (
      url.origin !== this.origin ||
      ![
        `/file/FilesField/${file.fileId}`,
        `/file/files-field/${file.fileId}`,
      ].includes(url.pathname) ||
      !url.searchParams.has('token')
    ) {
      throw new Error('CRM attached file URL is invalid');
    }
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        redirect: 'error',
      });
    } catch {
      throw new Error('CRM attached file verification failed');
    }
    if (!response.ok) {
      throw new Error('CRM attached file verification failed');
    }

    return readBytesBounded(response, MAX_SOURCE_FILE_BYTES);
  }

  private authenticatedHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Origin: this.origin,
    };
  }

  private async authenticatedJsonRequest(
    url: URL,
    init: RequestInit,
    operation: string,
  ): Promise<unknown> {
    const response = await this.authenticatedRequest(url, init, operation);

    return readJsonResponse(response, 8 * 1024 * 1024, { operation });
  }

  private async authenticatedRequest(
    url: URL,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    return this.withRequestLock(async () => {
      for (let attempt = 1; attempt <= MAX_API_REQUEST_ATTEMPTS; attempt += 1) {
        const waitMilliseconds = Math.max(
          0,
          this.nextApiRequestAtMilliseconds - this.now(),
        );
        if (waitMilliseconds > 0) await this.sleep(waitMilliseconds);

        const requestStartedAt = this.now();
        this.nextApiRequestAtMilliseconds =
          requestStartedAt + API_REQUEST_INTERVAL_MILLISECONDS;

        let response: Response;
        try {
          response = await this.fetcher(url, {
            ...init,
            headers: this.authenticatedHeaders(),
            redirect: 'error',
          });
        } catch {
          throw new Error(`${operation} failed`);
        }
        if (response.status !== 429 || attempt === MAX_API_REQUEST_ATTEMPTS) {
          return response;
        }

        const retryAfterMilliseconds = parseRetryAfterMilliseconds(
          response.headers.get('retry-after'),
          this.now(),
        );
        this.nextApiRequestAtMilliseconds = Math.max(
          this.nextApiRequestAtMilliseconds,
          this.now() + retryAfterMilliseconds,
        );
        await discardResponse(response);
      }

      throw new Error(`${operation} failed`);
    });
  }

  private async withRequestLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.requestTail;
    let release: (() => void) | undefined;
    this.requestTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  private async metadataRequest(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const body = await this.rawMetadataRequest(operationName, query, variables);
    if (errorMessages(body).length > 0 || !isRecord(body.data)) {
      throw new Error(`${operationName} failed`);
    }

    return body.data;
  }

  private async rawMetadataRequest(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const body = await this.authenticatedJsonRequest(
      new URL('/metadata', this.origin),
      {
        method: 'POST',
        body: JSON.stringify({ operationName, query, variables }),
      },
      operationName,
    );
    if (!isRecord(body))
      throw new Error(`${operationName} response is invalid`);

    return body;
  }
}

const parseRetryAfterMilliseconds = (
  value: string | null,
  nowMilliseconds: number,
): number => {
  let milliseconds = API_REQUEST_INTERVAL_MILLISECONDS;
  if (value && /^[0-9]+$/.test(value.trim())) {
    milliseconds = Number(value.trim()) * 1000;
  } else if (value) {
    const retryAt = Date.parse(value);
    if (!Number.isNaN(retryAt)) {
      milliseconds = Math.max(0, retryAt - nowMilliseconds);
    }
  }

  return Math.min(
    MAX_RETRY_AFTER_MILLISECONDS,
    Math.max(API_REQUEST_INTERVAL_MILLISECONDS, milliseconds),
  );
};

const discardResponse = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    // The response will be discarded regardless; retry remains fail-closed.
  }
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value: string, name: string): void => {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} is invalid`);
};

const assertHttpsUrl = (value: string, name: string): void => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error();
    }
  } catch {
    throw new Error(`${name} is invalid`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJsonResponse = async (
  response: Response,
  maximumBytes: number,
  options: { operation: string; allowErrorStatus?: boolean },
): Promise<unknown> => {
  if (!response.ok && options.allowErrorStatus !== true) {
    throw new Error(`${options.operation} failed`);
  }
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw new Error(`${options.operation} response is too large`);
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error(`${options.operation} response is invalid`);
  }
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
    throw new Error(`${options.operation} response is too large`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${options.operation} response is invalid`);
  }
};

const errorMessages = (body: Record<string, unknown>): string[] =>
  Array.isArray(body.errors)
    ? body.errors.flatMap((error) =>
        isRecord(error) && typeof error.message === 'string'
          ? [error.message]
          : [],
      )
    : [];

const deepStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(deepStrings);
  if (isRecord(value)) return Object.values(value).flatMap(deepStrings);

  return [];
};

const readBytesBounded = async (
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw new Error('CRM attached file verification failed');
  }
  if (!response.body) {
    throw new Error('CRM attached file verification failed');
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new Error('CRM attached file verification failed');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};
