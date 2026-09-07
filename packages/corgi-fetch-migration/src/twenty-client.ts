export type FetchLike = typeof fetch;

import type { MetadataField, MetadataObject } from './schema-bootstrap.ts';
import type { FieldDefinition, ObjectDefinition } from './schema.ts';

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

  async listAll(
    objectPlural: string,
  ): Promise<Array<Record<string, unknown> & { id: string }>> {
    const records: Array<Record<string, unknown> & { id: string }> = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams({ limit: '100', depth: '0' });
      if (cursor) query.set('starting_after', cursor);
      const response = await this.request<{
        data?: Record<string, unknown>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      }>(`/rest/${objectPlural}?${query}`);
      const items = response.data?.[objectPlural];

      if (!Array.isArray(items)) {
        throw new Error(
          `Twenty list response did not contain data.${objectPlural}`,
        );
      }
      records.push(
        ...(items as Array<Record<string, unknown> & { id: string }>),
      );
      cursor = response.pageInfo?.hasNextPage
        ? response.pageInfo.endCursor
        : undefined;
      if (response.pageInfo?.hasNextPage && !cursor) {
        throw new Error(
          `Twenty pagination omitted endCursor for ${objectPlural}`,
        );
      }
    } while (cursor);

    return records;
  }

  async batchUpsert(
    objectPlural: string,
    records: Record<string, unknown>[],
  ): Promise<void> {
    if (records.length < 1 || records.length > 100) {
      throw new Error('Twenty batch upsert requires 1 through 100 records');
    }
    await this.request(`/rest/batch/${objectPlural}?upsert=true&depth=0`, {
      method: 'POST',
      body: JSON.stringify(records),
    });
  }

  async getOne(
    objectPlural: string,
    id: string,
  ): Promise<Record<string, unknown> & { id: string }> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      `/rest/${objectPlural}/${encodeURIComponent(id)}?depth=0`,
    );
    const singular = objectPlural.endsWith('ies')
      ? `${objectPlural.slice(0, -3)}y`
      : objectPlural.endsWith('s')
        ? objectPlural.slice(0, -1)
        : objectPlural;
    const direct = response.data?.[singular];
    const operation = response.data
      ? Object.values(response.data).find(
          (value) =>
            value && typeof value === 'object' && !Array.isArray(value),
        )
      : undefined;
    const record = direct ?? operation;

    if (!record || typeof record !== 'object' || !('id' in record)) {
      throw new Error(
        `Twenty get response did not contain ${objectPlural}/${id}`,
      );
    }

    return record as Record<string, unknown> & { id: string };
  }

  async patchOne(
    objectPlural: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.request(
      `/rest/${objectPlural}/${encodeURIComponent(id)}?depth=0`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  async softDeleteOne(objectPlural: string, id: string): Promise<void> {
    await this.request(
      `/rest/${objectPlural}/${encodeURIComponent(id)}?soft_delete=true`,
      { method: 'DELETE' },
    );
  }

  async listMetadataObjects(): Promise<MetadataObject[]> {
    const objects: MetadataObject[] = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('starting_after', cursor);
      const response = await this.request<{
        data?: MetadataObject[] | { objects?: MetadataObject[] };
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      }>(`/rest/metadata/objects?${query}`);
      const items = Array.isArray(response.data)
        ? response.data
        : (response.data?.objects ?? []);
      objects.push(...items);
      cursor = response.pageInfo?.hasNextPage
        ? (response.pageInfo.endCursor ?? undefined)
        : undefined;
      if (response.pageInfo?.hasNextPage && !cursor) {
        throw new Error('Twenty metadata pagination omitted endCursor');
      }
    } while (cursor);

    return objects;
  }

  async createMetadataObject(definition: ObjectDefinition): Promise<void> {
    await this.request('/rest/metadata/objects', {
      method: 'POST',
      body: JSON.stringify({
        ...definition,
        isLabelSyncedWithName: false,
      }),
    });
  }

  async createMetadataField(
    definition: FieldDefinition,
    objectMetadataId: string,
    targetObjectMetadataId?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      objectMetadataId,
      type: definition.type,
      name: definition.name,
      label: definition.label,
      isLabelSyncedWithName: false,
      ...(definition.isUnique !== undefined
        ? { isUnique: definition.isUnique }
        : {}),
      ...(definition.options ? { options: definition.options } : {}),
    };

    if (definition.relation) {
      if (!targetObjectMetadataId) {
        throw new Error(`Missing target metadata ID for ${definition.name}`);
      }
      payload.relationCreationPayload = {
        targetObjectMetadataId,
        targetFieldLabel: definition.relation.targetFieldLabel,
        type: definition.relation.type,
      };
    }

    await this.request<MetadataField>('/rest/metadata/fields', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
