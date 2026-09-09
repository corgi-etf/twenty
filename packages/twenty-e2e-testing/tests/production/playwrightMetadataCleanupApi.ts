import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { type APIResponse, type Page } from '@playwright/test';

import { assertCanonicalizationComplete as assertCorgiCanonicalizationComplete } from '../../../corgi-crm-canonicalization/src/reconciliation.ts';
import {
  assertCompanyValuesCanonicalized,
  assertPeopleContactValuesCanonicalized,
  type MetadataCleanupApi,
  type MetadataCleanupJournal,
  type MetadataObject,
  type WorkspaceRecord,
} from './fetchMetadataCleanup';
import {
  assertAuditedCanonicalizationSnapshot,
  assertNoWorkflowReferences,
  type CanonicalizationSnapshot,
  type ExpectedCanonicalizationManifest,
} from './fetchMetadataCleanupPreflight';

type MetadataListResponse = {
  data?: MetadataObject[] | { objects?: MetadataObject[] };
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

type RecordListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const assertSuccessfulResponse = async (
  response: APIResponse,
  operation: string,
  allowedStatuses: number[] = [],
): Promise<void> => {
  if (!response.ok() && !allowedStatuses.includes(response.status())) {
    throw new Error(`${operation} failed with HTTP ${response.status()}`);
  }
};

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required cleanup environment ${name} is unset`);

  return value;
};

const positiveIntegerEnvironmentValue = (name: string): number => {
  const raw = requiredEnvironmentValue(name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Required cleanup environment ${name} is not positive`);
  }

  return value;
};

const expectedCanonicalizationManifest =
  (): ExpectedCanonicalizationManifest => {
    const rowCoverageHash = requiredEnvironmentValue(
      'CRM_CANONICALIZATION_ROW_COVERAGE_SHA256',
    );
    const businessContentHash = requiredEnvironmentValue(
      'CRM_CANONICALIZATION_BUSINESS_CONTENT_SHA256',
    );
    if (
      ![rowCoverageHash, businessContentHash].every((hash) =>
        /^[a-f0-9]{64}$/.test(hash),
      )
    ) {
      throw new Error(
        'Canonicalization dry-run hashes must be lowercase SHA-256',
      );
    }

    return {
      companyCount: positiveIntegerEnvironmentValue(
        'CRM_CANONICALIZATION_COMPANY_COUNT',
      ),
      peopleCount: positiveIntegerEnvironmentValue(
        'CRM_CANONICALIZATION_PEOPLE_COUNT',
      ),
      holdingCount: positiveIntegerEnvironmentValue(
        'CRM_CANONICALIZATION_HOLDING_COUNT',
      ),
      rowCoverageHash,
      businessContentHash,
    };
  };

const journalPath = (): string =>
  resolve(
    process.env.CRM_METADATA_CLEANUP_JOURNAL_PATH ??
      'packages/twenty-e2e-testing/run_results/production/metadata-cleanup-journal.json',
  );

const writeJournal = async (journal: MetadataCleanupJournal): Promise<void> => {
  const path = journalPath();
  const serializedJournal = JSON.stringify(journal);
  const payload = JSON.stringify(
    {
      sha256: createHash('sha256').update(serializedJournal).digest('hex'),
      journal,
    },
    null,
    2,
  );
  const temporaryPath = `${path}.tmp`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${payload}\n`, { encoding: 'utf8' });
  await rename(temporaryPath, path);
};

const readJournal = async (): Promise<MetadataCleanupJournal | undefined> => {
  let raw: string;
  try {
    raw = await readFile(journalPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const envelope = JSON.parse(raw) as {
    sha256?: unknown;
    journal?: unknown;
  };
  const serializedJournal = JSON.stringify(envelope.journal);
  const actualHash = createHash('sha256')
    .update(serializedJournal)
    .digest('hex');
  if (envelope.sha256 !== actualHash) {
    throw new Error('Cleanup resume journal failed its integrity check');
  }
  const journal = envelope.journal as MetadataCleanupJournal;
  if (
    journal?.schemaVersion !== 1 ||
    !['planned', 'running', 'complete'].includes(journal.status) ||
    !Array.isArray(journal.operations) ||
    !Array.isArray(journal.completedOperationKeys) ||
    !journal.preflightEvidence ||
    typeof journal.preflightEvidence !== 'object'
  ) {
    throw new Error('Cleanup resume journal has an invalid schema');
  }
  const expected = expectedCanonicalizationManifest();
  if (
    journal.preflightEvidence.rowCoverageHash !== expected.rowCoverageHash ||
    journal.preflightEvidence.businessContentHash !==
      expected.businessContentHash ||
    journal.preflightEvidence.companyCount !== expected.companyCount ||
    journal.preflightEvidence.peopleCount !== expected.peopleCount ||
    journal.preflightEvidence.holdingObservationCount !== expected.holdingCount
  ) {
    throw new Error(
      'Cleanup resume journal does not match the approved dry-run manifest',
    );
  }

  return journal;
};

export const createRateLimitedRequest = ({
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

  return async (request: () => Promise<APIResponse>): Promise<APIResponse> => {
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
      const retryDelay = Number.isFinite(retryAfter)
        ? Math.min(Math.max(retryAfter * 1000, minimumIntervalMs), 30_000)
        : Math.min(1000 * 2 ** attempt, 30_000);
      await response.dispose();
      if (attempt === 4) continue;
      await wait(retryDelay);
    }

    throw new Error('CRM cleanup request remained rate limited after retries');
  };
};

export const createPlaywrightMetadataCleanupApi = ({
  page,
  backendBaseUrl,
  frontendBaseUrl,
}: {
  page: Page;
  backendBaseUrl: string;
  frontendBaseUrl: string;
}): MetadataCleanupApi => {
  const origin = new URL(frontendBaseUrl).origin;
  const restUrl = (path: string) =>
    new URL(`/rest/${path}`, backendBaseUrl).toString();
  const headers = { Origin: origin };
  const pacedRequest = createRateLimitedRequest();
  const listRecords = async (
    objectNamePlural: string,
  ): Promise<WorkspaceRecord[]> => {
    const records: WorkspaceRecord[] = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams({ limit: '100', depth: '0' });
      if (cursor) query.set('starting_after', cursor);
      const response = await pacedRequest(() =>
        page.request.get(`${restUrl(objectNamePlural)}?${query.toString()}`, {
          headers,
        }),
      );
      await assertSuccessfulResponse(
        response,
        `List ${objectNamePlural} records`,
      );
      const body = (await response.json()) as RecordListResponse;
      const pageRecords = body.data?.[objectNamePlural];
      if (!Array.isArray(pageRecords)) {
        throw new Error(
          `List ${objectNamePlural} response omitted data.${objectNamePlural}`,
        );
      }
      records.push(...(pageRecords as WorkspaceRecord[]));
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error(
          `${objectNamePlural} pagination omitted its end cursor`,
        );
      }
    } while (cursor);

    return records;
  };

  return {
    async listMetadataObjects() {
      const objects: MetadataObject[] = [];
      let cursor: string | undefined;

      do {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('starting_after', cursor);
        const response = await pacedRequest(() =>
          page.request.get(
            `${restUrl('metadata/objects')}?${query.toString()}`,
            { headers },
          ),
        );
        await assertSuccessfulResponse(response, 'List metadata objects');
        const body = (await response.json()) as MetadataListResponse;
        const pageObjects = Array.isArray(body.data)
          ? body.data
          : (body.data?.objects ?? []);

        objects.push(...pageObjects);
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error('Metadata pagination omitted its end cursor');
        }
      } while (cursor);

      return objects;
    },

    listRecords,

    async assertCanonicalizationComplete() {
      const snapshot: CanonicalizationSnapshot = {
        companies: await listRecords('companies'),
        people: await listRecords('people'),
        sourceRecords: await listRecords('sourceRecords'),
        importReviewItems: await listRecords('importReviewItems'),
        holdingObservations: await listRecords('holdingObservations'),
        tasks: await listRecords('tasks'),
        taskTargets: await listRecords('taskTargets'),
        wholesalers: await listRecords('wholesalers'),
        leadAssignments: await listRecords('leadAssignments'),
        outreachActivities: await listRecords('outreachActivities'),
        archivedOutreachActivities: await listRecords(
          'archivedOutreachActivities',
        ),
      };
      const report = assertCorgiCanonicalizationComplete(snapshot);
      assertPeopleContactValuesCanonicalized(snapshot.people);
      assertCompanyValuesCanonicalized(
        snapshot.companies,
        snapshot.sourceRecords,
        snapshot.importReviewItems,
      );
      assertAuditedCanonicalizationSnapshot(
        snapshot,
        report,
        expectedCanonicalizationManifest(),
      );

      return {
        rowCoverageHash: report.rowCoverageHash,
        businessContentHash: report.businessContentHash,
        sourceRecordCount: snapshot.sourceRecords.length,
        importReviewItemCount: snapshot.importReviewItems.length,
        companyCount: snapshot.companies.length,
        peopleCount: snapshot.people.length,
        taskCount: snapshot.tasks.length,
        taskTargetCount: snapshot.taskTargets.length,
        wholesalerCount: snapshot.wholesalers.length,
        leadAssignmentCount: snapshot.leadAssignments.length,
        outreachActivityCount: snapshot.outreachActivities.length,
        holdingObservationCount: snapshot.holdingObservations.length,
        archivedOutreachActivityCount:
          snapshot.archivedOutreachActivities.length,
      };
    },

    async assertNoWorkflowReferences(plan) {
      const workflows = await listRecords('workflows');
      const workflowVersions = await listRecords('workflowVersions');
      assertNoWorkflowReferences([...workflows, ...workflowVersions], plan);
    },

    readCleanupJournal: readJournal,
    writeCleanupJournal: writeJournal,

    async deleteMetadataObject(id) {
      const response = await pacedRequest(() =>
        page.request.delete(restUrl(`metadata/objects/${id}`), { headers }),
      );
      await assertSuccessfulResponse(response, 'Delete metadata object', [404]);
    },

    async deleteMetadataField(id) {
      const response = await pacedRequest(() =>
        page.request.delete(restUrl(`metadata/fields/${id}`), { headers }),
      );
      await assertSuccessfulResponse(response, 'Delete metadata field', [404]);
    },

    async updateMetadataField(id, update) {
      const response = await pacedRequest(() =>
        page.request.patch(restUrl(`metadata/fields/${id}`), {
          headers,
          data: { ...update, isLabelSyncedWithName: false },
        }),
      );
      await assertSuccessfulResponse(response, 'Update metadata field');
    },
  };
};
