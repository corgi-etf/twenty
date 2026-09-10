import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION,
  type ActivityTypeBackfillApi,
  type ActivityTypeBackfillCheckpoint,
  type ActivityTypeBackfillReadApi,
} from './activity-type-backfill-execution.ts';
import { type OutreachActivityRow } from './activity-type-backfill.ts';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const PAGE_LIMIT = 100;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type BackfillResponse = {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
  dispose(): Promise<void>;
};

export type BackfillRequest = {
  get(url: string, options: { headers: Record<string, string> }): Promise<BackfillResponse>;
  patch(
    url: string,
    options: { headers: Record<string, string>; data: unknown },
  ): Promise<BackfillResponse>;
};

export type ActivityTypeBackfillApiOptions = {
  origin: string;
  apiKey: string;
  request: BackfillRequest;
  checkpointFilePath: string;
  pace?: <TResult>(operation: () => Promise<TResult>) => Promise<TResult>;
};

type RecordListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const assertSuccessfulResponse = async (
  response: BackfillResponse,
  operation: string,
): Promise<void> => {
  if (!response.ok()) {
    const status = response.status();
    await response.dispose();
    throw new Error(`${operation} failed with HTTP ${status}`);
  }
};

const disposeAfterJson = async <TBody>(
  response: BackfillResponse,
  operation: string,
): Promise<TBody> => {
  try {
    try {
      return (await response.json()) as TBody;
    } catch {
      throw new Error(`${operation} response was not valid JSON`);
    }
  } finally {
    await response.dispose();
  }
};

const checkpointHash = (checkpoint: ActivityTypeBackfillCheckpoint): string =>
  createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

const assertCheckpoint = (
  value: unknown,
): ActivityTypeBackfillCheckpoint => {
  const checkpoint = value as ActivityTypeBackfillCheckpoint;
  let canonicalOrigin = '';
  try {
    canonicalOrigin = new URL(checkpoint?.origin).origin;
  } catch {
    // The shape check below raises a redacted error.
  }
  if (
    checkpoint?.schemaVersion !== 1 ||
    typeof checkpoint.origin !== 'string' ||
    canonicalOrigin !== checkpoint.origin ||
    typeof checkpoint.planHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(checkpoint.planHash) ||
    !Array.isArray(checkpoint.appliedIds) ||
    checkpoint.appliedIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(checkpoint.appliedIds).size !== checkpoint.appliedIds.length
  ) {
    throw new Error('Activity type backfill checkpoint is invalid');
  }

  return checkpoint;
};

const buildReadApi = ({
  origin,
  apiKey,
  request,
  checkpointFilePath,
  pace = (operation) => operation(),
}: ActivityTypeBackfillApiOptions): ActivityTypeBackfillReadApi => {
  if (new URL(origin).origin !== APPROVED_ORIGIN) {
    throw new Error('Activity type backfill origin is not approved');
  }
  if (!apiKey.trim()) {
    throw new Error('Activity type backfill requires TWENTY_API_KEY');
  }

  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };
  const restUrl = (path: string) => `${APPROVED_ORIGIN}/rest/${path}`;

  return {
    async listOutreachActivities() {
      const rows: OutreachActivityRow[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({
          limit: String(PAGE_LIMIT),
          depth: '0',
        });
        if (cursor) query.set('starting_after', cursor);
        const response = await pace(() =>
          request.get(`${restUrl('outreachActivities')}?${query.toString()}`, {
            headers,
          }),
        );
        await assertSuccessfulResponse(response, 'List outreach activities');
        const body = await disposeAfterJson<RecordListResponse>(
          response,
          'Outreach activity list',
        );
        const pageRows = body.data?.outreachActivities;
        if (!Array.isArray(pageRows)) {
          throw new Error('Outreach activity list response has an invalid shape');
        }
        for (const row of pageRows as OutreachActivityRow[]) {
          if (!row?.id || typeof row.updatedAt !== 'string') {
            throw new Error(
              'Outreach activity row is missing its id or updatedAt',
            );
          }
          rows.push(row);
        }
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        // A truncated read would look like a smaller inventory rather than an
        // error, so a missing cursor fails the run instead of returning short.
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error('Outreach activity pagination omitted its cursor');
        }
      } while (cursor);

      return rows;
    },

    async readCheckpoint() {
      let raw: string;
      try {
        raw = await readFile(checkpointFilePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
      let envelope: { sha256?: unknown; checkpoint?: unknown };
      try {
        envelope = JSON.parse(raw) as typeof envelope;
      } catch {
        throw new Error('Activity type backfill checkpoint is invalid JSON');
      }
      const checkpoint = assertCheckpoint(envelope.checkpoint);
      if (envelope.sha256 !== checkpointHash(checkpoint)) {
        throw new Error(
          'Activity type backfill checkpoint failed its integrity check',
        );
      }

      return checkpoint;
    },

    async writeCheckpoint(checkpoint) {
      assertCheckpoint(checkpoint);
      const temporaryPath = `${checkpointFilePath}.tmp-${randomUUID()}`;
      const payload = JSON.stringify(
        { sha256: checkpointHash(checkpoint), checkpoint },
        null,
        2,
      );
      await mkdir(dirname(checkpointFilePath), { recursive: true });
      try {
        await writeFile(temporaryPath, `${payload}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });
        await rename(temporaryPath, checkpointFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    },
  };
};

// The dry run gets this one. It has no write method to call, so no future edit
// to the run logic can make a dry run mutate production.
export const createActivityTypeBackfillReadApi = (
  options: ActivityTypeBackfillApiOptions,
): ActivityTypeBackfillReadApi => buildReadApi(options);

declare const writeGrantBrand: unique symbol;

export type ActivityTypeBackfillWriteGrant = {
  [writeGrantBrand]: true;
};

export const grantActivityTypeBackfillWrite = (
  confirmation: string,
): ActivityTypeBackfillWriteGrant => {
  if (confirmation !== APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION) {
    throw new Error('Activity type backfill write grant is invalid');
  }

  return {} as ActivityTypeBackfillWriteGrant;
};

// Obtaining the write adapter needs a grant that only the exact confirmation
// produces, so a caller cannot reach the patch method by passing a flag.
export const createActivityTypeBackfillWriteApi = (
  options: ActivityTypeBackfillApiOptions,
  grant: ActivityTypeBackfillWriteGrant,
): ActivityTypeBackfillApi => {
  if (!grant || typeof grant !== 'object') {
    throw new Error('Activity type backfill write grant is required');
  }

  const readApi = buildReadApi(options);
  const { apiKey, request } = options;
  const pace =
    options.pace ??
    (<TResult>(operation: () => Promise<TResult>) => operation());
  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };

  return {
    ...readApi,

    async conditionalPatchOutreachActivity(id, expectedUpdatedAt, data) {
      if (!id || !expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw new Error('Conditional activity type update is invalid');
      }
      if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BODY_BYTES) {
        throw new Error('Conditional activity type update body is too large');
      }
      const filter = `and(id[eq]:${JSON.stringify(id)},updatedAt[eq]:${JSON.stringify(expectedUpdatedAt)})`;
      const query = new URLSearchParams({ filter, depth: '0' });
      const response = await pace(() =>
        request.patch(
          `${APPROVED_ORIGIN}/rest/outreachActivities?${query.toString()}`,
          { headers, data },
        ),
      );
      await assertSuccessfulResponse(response, 'Update outreach activity');
      const body = await disposeAfterJson<RecordListResponse>(
        response,
        'Outreach activity update',
      );
      const updated = body.data?.updateOutreachActivities;
      // The filter pins updatedAt, so matching nothing means the row changed
      // under us and this plan no longer describes it.
      if (
        !Array.isArray(updated) ||
        updated.length !== 1 ||
        (updated[0] as { id?: string } | undefined)?.id !== id
      ) {
        throw new Error('Activity type backfill concurrency conflict');
      }
    },
  };
};
