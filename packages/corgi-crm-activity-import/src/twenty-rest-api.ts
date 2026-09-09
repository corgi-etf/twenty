import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  assertActivityImportManifest,
  type ActivityImportApi,
  type ActivityImportCheckpoint,
} from './execution.ts';
import type {
  ActivityImportCompany,
  ActivityImportWholesaler,
  OutreachActivityRecord,
} from './importer.ts';

export const ACTIVITY_IMPORT_APPROVED_ORIGIN = 'https://crm.corgiinvest.com';

export type ActivityImportResponse = {
  ok(): boolean;
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
  dispose(): Promise<void>;
};

type RequestOptions = {
  headers: Record<string, string>;
  data?: unknown;
};

export type ActivityImportRequestContext = {
  get(url: string, options: RequestOptions): Promise<ActivityImportResponse>;
  post(url: string, options: RequestOptions): Promise<ActivityImportResponse>;
};

export const createActivityImportRequestGate = ({
  minimumIntervalMs = 650,
  now = Date.now,
  wait = (delay: number) =>
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delay)),
}: {
  minimumIntervalMs?: number;
  now?: () => number;
  wait?: (delay: number) => Promise<void>;
} = {}) => {
  let lastRequestAt: number | undefined;

  return async (
    request: () => Promise<ActivityImportResponse>,
  ): Promise<ActivityImportResponse> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const delay =
        lastRequestAt === undefined
          ? 0
          : Math.max(0, minimumIntervalMs - (now() - lastRequestAt));
      if (delay > 0) await wait(delay);
      const response = await request();
      lastRequestAt = now();
      if (response.status() !== 429) return response;
      const retryAfter = Number(response.headers()['retry-after']);
      await response.dispose();
      if (attempt < 4) {
        await wait(
          Number.isFinite(retryAfter)
            ? Math.min(Math.max(retryAfter * 1000, minimumIntervalMs), 30_000)
            : Math.min(1000 * 2 ** attempt, 30_000),
        );
      }
    }

    throw new Error('Activity import API remained rate limited after retries');
  };
};

const assertSuccessfulResponse = async (
  response: ActivityImportResponse,
  operation: string,
): Promise<void> => {
  if (!response.ok()) {
    const status = response.status();
    await response.dispose();
    throw new Error(`${operation} failed with HTTP ${status}`);
  }
};

const disposeAfterJson = async <T>(
  response: ActivityImportResponse,
  operation: string,
): Promise<T> => {
  try {
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error(`${operation} response was not valid JSON`);
    }
  } finally {
    await response.dispose();
  }
};

type ListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const checkpointHash = (checkpoint: ActivityImportCheckpoint): string =>
  createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

const assertCheckpoint = (value: unknown): ActivityImportCheckpoint => {
  const checkpoint = value as ActivityImportCheckpoint;
  if (
    checkpoint?.schemaVersion !== 1 ||
    !['planned', 'applying', 'verifying', 'complete'].includes(
      checkpoint.status,
    ) ||
    !Array.isArray(checkpoint.completedOperationHashes) ||
    checkpoint.completedOperationHashes.some(
      (hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash),
    ) ||
    new Set(checkpoint.completedOperationHashes).size !==
      checkpoint.completedOperationHashes.length
  ) {
    throw new Error('Activity import checkpoint has an invalid shape');
  }
  assertActivityImportManifest(checkpoint.manifest);

  return checkpoint;
};

export const createTwentyActivityImportApi = (options: {
  request: ActivityImportRequestContext;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  checkpointPath: string;
  requestGate?: ReturnType<typeof createActivityImportRequestGate>;
}): ActivityImportApi => {
  let backendOrigin = '';
  let frontendOrigin = '';
  try {
    backendOrigin = new URL(options.backendBaseUrl).origin;
    frontendOrigin = new URL(options.frontendBaseUrl).origin;
  } catch {
    throw new Error('Activity import API origin is invalid');
  }
  if (
    options.backendBaseUrl !== backendOrigin ||
    options.frontendBaseUrl !== frontendOrigin ||
    backendOrigin !== ACTIVITY_IMPORT_APPROVED_ORIGIN ||
    frontendOrigin !== ACTIVITY_IMPORT_APPROVED_ORIGIN
  ) {
    throw new Error('Activity import API origin is not approved');
  }
  const headers = { Origin: frontendOrigin };
  const gate = options.requestGate ?? createActivityImportRequestGate();
  const restUrl = (path: string) =>
    new URL(`/rest/${path}`, backendOrigin).toString();

  const listAll = async <T>(
    objectPlural: string,
    operation: string,
  ): Promise<T[]> => {
    const records: T[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100', depth: '0' });
      if (cursor) query.set('starting_after', cursor);
      const response = await gate(() =>
        options.request.get(`${restUrl(objectPlural)}?${query.toString()}`, {
          headers,
        }),
      );
      await assertSuccessfulResponse(response, operation);
      const body = await disposeAfterJson<ListResponse>(response, operation);
      const pageRecords = body.data?.[objectPlural];
      if (!Array.isArray(pageRecords)) {
        throw new Error(`${operation} response has an invalid shape`);
      }
      records.push(...(pageRecords as T[]));
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error(`${operation} pagination omitted its cursor`);
      }
    } while (cursor);

    return records;
  };

  return {
    listCompanies: () =>
      listAll<ActivityImportCompany>('companies', 'List companies'),
    listWholesalers: () =>
      listAll<ActivityImportWholesaler>('wholesalers', 'List wholesalers'),
    listOutreachActivities: () =>
      listAll<OutreachActivityRecord>(
        'outreachActivities',
        'List outreach activities',
      ),
    async createOutreachActivity(record) {
      const serialized = JSON.stringify(record);
      if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
        throw new Error('Activity import create body is too large');
      }
      const response = await gate(() =>
        options.request.post(`${restUrl('outreachActivities')}?depth=0`, {
          headers,
          data: record,
        }),
      );
      await assertSuccessfulResponse(response, 'Create outreach activity');
      await response.dispose();
    },
    async readCheckpoint() {
      let raw: string;
      try {
        raw = await readFile(options.checkpointPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return undefined;
        throw error;
      }
      let envelope: { sha256?: unknown; checkpoint?: unknown };
      try {
        envelope = JSON.parse(raw) as typeof envelope;
      } catch {
        throw new Error('Activity import checkpoint is invalid JSON');
      }
      const checkpoint = assertCheckpoint(envelope.checkpoint);
      if (envelope.sha256 !== checkpointHash(checkpoint)) {
        throw new Error(
          'Activity import checkpoint failed its integrity check',
        );
      }

      return checkpoint;
    },
    async writeCheckpoint(checkpoint) {
      assertCheckpoint(checkpoint);
      await mkdir(dirname(options.checkpointPath), { recursive: true });
      const temporaryPath = `${options.checkpointPath}.tmp-${randomUUID()}`;
      const envelope = {
        sha256: checkpointHash(checkpoint),
        checkpoint,
      };
      try {
        await writeFile(
          temporaryPath,
          `${JSON.stringify(envelope, null, 2)}\n`,
          { encoding: 'utf8', flag: 'wx' },
        );
        await rename(temporaryPath, options.checkpointPath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    },
  };
};
