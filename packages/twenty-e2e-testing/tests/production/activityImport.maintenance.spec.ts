import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  preflightActivityImportArtifacts,
  writeActivityImportResult,
} from '../../../corgi-crm-activity-import/src/artifacts.ts';
import {
  assertActivityImportManifest,
  runActivityImport,
  runActivityImportCompanyCreation,
  runActivityImportDuplicateCompanyResolution,
} from '../../../corgi-crm-activity-import/src/execution.ts';
import {
  assertTerritoryIdentityArtifact,
  COMPANY_LINK_COLLECTIONS,
  type ActivityImportCsvOptions,
  type ActivityImportNormalizationReceipt,
} from '../../../corgi-crm-activity-import/src/importer.ts';
import {
  ACTIVITY_IMPORT_APPROVED_ORIGIN,
  createActivityImportRequestGate,
} from '../../../corgi-crm-activity-import/src/twenty-rest-api.ts';
import {
  assertWorkspaceConfigTenant,
  createWorkspaceConfigRequestGate,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { createPlaywrightActivityImportApi } from './playwrightActivityImportApi.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment.ts';

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value)
    throw new Error(`Required activity import environment ${name} is unset`);

  return value;
};

const parseIdentityArtifact = async (path: string) => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('Activity import identity artifact is invalid JSON');
  }

  return assertTerritoryIdentityArtifact(value);
};

const parseExpectedManifest = () => {
  const serialized = process.env.CRM_ACTIVITY_IMPORT_EXPECTED_MANIFEST;
  if (!serialized) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Activity import expected manifest is invalid JSON');
  }

  return assertActivityImportManifest(value);
};

test.skip(
  process.env.CRM_ACTIVITY_IMPORT_ENABLED !== 'true',
  'Activity import is available only through its guarded production workflow.',
);

test('runs a guarded, idempotent outreach activity import', async ({
  page,
}) => {
  test.setTimeout(2 * 60 * 60_000);
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  if (
    BACKEND_BASE_URL !== ACTIVITY_IMPORT_APPROVED_ORIGIN ||
    FRONTEND_BASE_URL !== ACTIVITY_IMPORT_APPROVED_ORIGIN
  ) {
    throw new Error('Activity import production origin is not approved');
  }
  const mode = requiredEnvironment('CRM_ACTIVITY_IMPORT_MODE');
  if (mode !== 'dry-run' && mode !== 'apply') {
    throw new Error('CRM_ACTIVITY_IMPORT_MODE must be dry-run or apply');
  }
  // Defaulting to the import keeps an unset variable byte-for-byte identical
  // to the behaviour before company creation existed.
  const operation =
    process.env.CRM_ACTIVITY_IMPORT_OPERATION || 'import-activities';
  if (
    operation !== 'import-activities' &&
    operation !== 'create-companies' &&
    operation !== 'resolve-duplicate-companies'
  ) {
    throw new Error('CRM_ACTIVITY_IMPORT_OPERATION is invalid');
  }
  const sourceFormat = requiredEnvironment('CRM_ACTIVITY_IMPORT_SOURCE_FORMAT');
  if (
    sourceFormat !== 'legacy-nash-outreach-v1' &&
    sourceFormat !== 'completed-actions-v2'
  ) {
    throw new Error('CRM_ACTIVITY_IMPORT_SOURCE_FORMAT is invalid');
  }
  const ownerLabel = requiredEnvironment('CRM_ACTIVITY_IMPORT_OWNER_LABEL');
  if (ownerLabel !== 'Grace' && ownerLabel !== 'Nash') {
    throw new Error('CRM_ACTIVITY_IMPORT_OWNER_LABEL is invalid');
  }
  const paths = await preflightActivityImportArtifacts({
    runnerTemp: requiredEnvironment('RUNNER_TEMP'),
    sourcePath: requiredEnvironment('CRM_ACTIVITY_IMPORT_SOURCE_PATH'),
    identityPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_IDENTITY_PATH'),
    checkpointPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_CHECKPOINT_PATH'),
    resultPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_RESULT_PATH'),
  });
  const source = await readFile(paths.sourcePath);
  const identityArtifact = await parseIdentityArtifact(paths.identityPath);
  const sourceSha256 = requiredEnvironment('CRM_ACTIVITY_IMPORT_SOURCE_SHA256');
  const provenanceSha256 = requiredEnvironment(
    'CRM_ACTIVITY_IMPORT_PROVENANCE_SHA256',
  );
  const expectedRowSequenceSha256 =
    process.env.CRM_ACTIVITY_IMPORT_EXPECTED_ROW_SEQUENCE_SHA256 || undefined;
  const expectedRows = Number(
    requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_ROWS'),
  );
  const normalizationReceipt: ActivityImportNormalizationReceipt | undefined =
    sourceFormat === 'completed-actions-v2'
      ? {
          schemaVersion: 1 as const,
          sourceFormat,
          sourceDocumentSha256: provenanceSha256,
          normalizedCsvSha256: sourceSha256,
          rowSequenceSha256: requiredEnvironment(
            'CRM_ACTIVITY_IMPORT_EXPECTED_ROW_SEQUENCE_SHA256',
          ),
          sourceRowCount: Number(
            requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_SOURCE_ROWS'),
          ),
          activityCount: expectedRows,
          phoneCallCount: Number(
            requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_PHONE_CALLS'),
          ),
          voicemailCount: Number(
            requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_VOICEMAILS'),
          ),
          emailCount: Number(
            requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_EMAILS'),
          ),
        }
      : undefined;
  const requestGate = createActivityImportRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin: FRONTEND_BASE_URL,
    requestGate: createWorkspaceConfigRequestGate(),
  });
  const csvOptions: ActivityImportCsvOptions = {
    sourceFormat,
    ownerLabel,
    sourceSha256,
    provenanceSha256,
    expectedRowSequenceSha256,
    expectedRows,
    activityDate: requiredEnvironment('CRM_ACTIVITY_IMPORT_DATE'),
    timeZone: requiredEnvironment('CRM_ACTIVITY_IMPORT_TIME_ZONE'),
    importId: requiredEnvironment('CRM_ACTIVITY_IMPORT_ID'),
    normalizationReceipt,
  };
  const api = createPlaywrightActivityImportApi({
    page,
    backendBaseUrl: BACKEND_BASE_URL,
    frontendBaseUrl: FRONTEND_BASE_URL,
    checkpointPath: paths.checkpointPath,
    requestGate,
  });

  // Shared by both maintenance operations: the REST client owning the
  // authenticated read/write path is outside the deployment revision guard
  // allowlist, so anything beyond the plain import reuses this run's already
  // authenticated request context and its paced gate rather than standing up
  // a second client.
  const readRest = async (
    url: string,
    label: string,
  ): Promise<{
    data?: Record<string, unknown>;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  }> => {
    const response = await requestGate(() =>
      page.request.get(url, { headers: { Origin: FRONTEND_BASE_URL } }),
    );
    const failedStatus = response.ok() ? undefined : response.status();
    let body: unknown;
    try {
      if (failedStatus === undefined) body = await response.json();
    } finally {
      await response.dispose();
    }
    if (failedStatus !== undefined) {
      throw new Error(`${label} failed with HTTP ${failedStatus}`);
    }

    return (body ?? {}) as { data?: Record<string, unknown> };
  };

  // Twenty excludes soft-deleted records from every default listing, and only
  // naming deletedAt in the filter widens the query. Without this the
  // zero-match check cannot see a namesake waiting to be restored.
  const listSoftDeletedCompanies = async () => {
    const records: { id: string; name: unknown; createdAt?: unknown }[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({
        filter: 'deletedAt[is]:NOT_NULL',
        limit: '100',
        depth: '0',
      });
      if (cursor) query.set('starting_after', cursor);
      const body = await readRest(
        new URL(
          `/rest/companies?${query.toString()}`,
          BACKEND_BASE_URL,
        ).toString(),
        'List soft-deleted companies',
      );
      const pageRecords = body.data?.companies;
      if (!Array.isArray(pageRecords)) {
        throw new Error('List soft-deleted companies has an invalid shape');
      }
      records.push(...(pageRecords as typeof records));
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error(
          'List soft-deleted companies pagination omitted its cursor',
        );
      }
    } while (cursor);

    return records;
  };

  if (operation === 'resolve-duplicate-companies') {
    const readCompanyLinks = async (companyId: string) => {
      const payload = (
        await readRest(
          new URL(
            `/rest/companies/${companyId}?depth=1`,
            BACKEND_BASE_URL,
          ).toString(),
          'Read company',
        )
      ).data;
      const company = (payload?.company ?? payload) as
        | Record<string, unknown>
        | undefined;
      if (!company || typeof company !== 'object' || company.id !== companyId) {
        throw new Error('Read company returned an invalid shape');
      }

      // Count every child collection with its own filtered read. A depth=1
      // expansion alone cannot prove emptiness, because a to-many relation the
      // server did not expand is indistinguishable from an empty one -- and
      // reading that as empty is exactly what would delete real history.
      const counted: Record<string, unknown> = {};
      const absentCollections: string[] = [];
      for (const { collection, foreignKey } of COMPANY_LINK_COLLECTIONS) {
        const query = new URLSearchParams({
          filter: `${foreignKey}[eq]:${companyId}`,
          limit: '1',
          depth: '0',
        });
        // A 400 here means this workspace has no such object -- the REST layer
        // rejects the path outright rather than returning an empty page. That
        // is genuinely "no relation to check", unlike a 5xx or an auth failure,
        // which still have to block: an unreadable relation is indistinguishable
        // from an empty one. The absent collection is reported, never silently
        // treated as proof of emptiness.
        let body;
        try {
          body = (
            await readRest(
              new URL(
                `/rest/${collection}?${query.toString()}`,
                BACKEND_BASE_URL,
              ).toString(),
              `List ${collection}`,
            )
          ).data;
        } catch (error) {
          if (!/failed with HTTP 400$/.test((error as Error).message)) throw error;
          absentCollections.push(collection);
          counted[collection] = [];
          continue;
        }
        const records = body?.[collection];
        if (!Array.isArray(records)) {
          throw new Error(`List ${collection} response has an invalid shape`);
        }
        counted[collection] = records;
      }

      if (absentCollections.length > 0) {
        console.log(
          JSON.stringify({
            companyLinkProbe: { companyId, absentCollections },
          }),
        );
      }

      return { ...company, ...counted };
    };

    const deleteCompany = async (companyId: string) => {
      // soft_delete=true is mandatory. The REST default is a destroy, which
      // cascades into companyAllocations and nulls the company on its
      // meetingBookings; a soft delete drops the record out of the default
      // listing and stays reversible.
      const response = await requestGate(() =>
        page.request.delete(
          new URL(
            `/rest/companies/${companyId}?soft_delete=true`,
            BACKEND_BASE_URL,
          ).toString(),
          { headers: { Origin: FRONTEND_BASE_URL } },
        ),
      );
      const failedStatus = response.ok() ? undefined : response.status();
      await response.dispose();
      if (failedStatus !== undefined) {
        throw new Error(`Delete company failed with HTTP ${failedStatus}`);
      }
    };

    const resolution = await runActivityImportDuplicateCompanyResolution(
      { ...api, readCompanyLinks, deleteCompany },
      {
        source,
        csvOptions,
        mode,
        confirmation:
          process.env.CRM_ACTIVITY_IMPORT_RESOLVE_DUPLICATES_CONFIRMATION,
      },
    );
    // writeActivityImportResult demands a full activity manifest, which this
    // operation cannot produce, so the report is written directly to the same
    // uploaded artifact path.
    await writeFile(
      paths.resultPath,
      `${JSON.stringify(resolution, null, 2)}\n`,
      'utf8',
    );

    expect(resolution.operation).toBe('resolve-duplicate-companies');
    expect(resolution.mode).toBe(mode);
    if (mode === 'dry-run') expect(resolution.removedCount).toBe(0);
    else expect(resolution.removedCount).toBe(resolution.plannedRemovalCount);

    return;
  }

  if (operation === 'create-companies') {
    // The REST client owning the authenticated write path cannot be extended
    // under the deployment revision guard allowlist, so creation reuses that
    // same authenticated request context and the same paced gate as every
    // other call in this run rather than standing up a second client.
    const createCompany = async ({ name }: { name: string }) => {
      const response = await requestGate(() =>
        page.request.post(
          new URL('/rest/companies?depth=0', BACKEND_BASE_URL).toString(),
          { headers: { Origin: FRONTEND_BASE_URL }, data: { name } },
        ),
      );
      const failedStatus = response.ok() ? undefined : response.status();
      await response.dispose();
      if (failedStatus !== undefined) {
        throw new Error(`Create company failed with HTTP ${failedStatus}`);
      }
    };
    const creation = await runActivityImportCompanyCreation(
      { ...api, createCompany, listSoftDeletedCompanies },
      {
        source,
        csvOptions,
        mode,
        confirmation:
          process.env.CRM_ACTIVITY_IMPORT_CREATE_COMPANIES_CONFIRMATION,
      },
    );
    // writeActivityImportResult demands a full activity manifest, which cannot
    // exist while the companies are still missing, so the creation report is
    // written directly to the same uploaded artifact path.
    await writeFile(
      paths.resultPath,
      `${JSON.stringify(creation, null, 2)}\n`,
      'utf8',
    );

    expect(creation.operation).toBe('create-companies');
    expect(creation.mode).toBe(mode);
    if (mode === 'dry-run') expect(creation.createdCount).toBe(0);
    else expect(creation.plannedCount).toBe(creation.createdCount);

    return;
  }

  const result = await runActivityImport(api, {
    source,
    csvOptions,
    identityArtifact,
    mode,
    confirmation: process.env.CRM_ACTIVITY_IMPORT_CONFIRMATION,
    expectedManifest: parseExpectedManifest(),
  });
  await writeActivityImportResult(paths.resultPath, result);

  expect(result.plannedCount).toBe(result.manifest.expectedRows);
  if (mode === 'apply') expect(result.status).toBe('complete');
});
