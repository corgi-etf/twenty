import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  preflightActivityImportArtifacts,
  writeActivityImportResult,
} from '../../../corgi-crm-activity-import/src/artifacts.ts';
import {
  assertActivityImportManifest,
  runActivityImport,
} from '../../../corgi-crm-activity-import/src/execution.ts';
import { assertTerritoryIdentityArtifact } from '../../../corgi-crm-activity-import/src/importer.ts';
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
  const paths = await preflightActivityImportArtifacts({
    runnerTemp: requiredEnvironment('RUNNER_TEMP'),
    sourcePath: requiredEnvironment('CRM_ACTIVITY_IMPORT_SOURCE_PATH'),
    identityPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_IDENTITY_PATH'),
    checkpointPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_CHECKPOINT_PATH'),
    resultPath: requiredEnvironment('CRM_ACTIVITY_IMPORT_RESULT_PATH'),
  });
  const source = await readFile(paths.sourcePath);
  const identityArtifact = await parseIdentityArtifact(paths.identityPath);
  const requestGate = createActivityImportRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin: FRONTEND_BASE_URL,
    requestGate: createWorkspaceConfigRequestGate(),
  });
  const result = await runActivityImport(
    createPlaywrightActivityImportApi({
      page,
      backendBaseUrl: BACKEND_BASE_URL,
      frontendBaseUrl: FRONTEND_BASE_URL,
      checkpointPath: paths.checkpointPath,
      requestGate,
    }),
    {
      source,
      csvOptions: {
        sourceSha256: requiredEnvironment('CRM_ACTIVITY_IMPORT_SOURCE_SHA256'),
        expectedRows: Number(
          requiredEnvironment('CRM_ACTIVITY_IMPORT_EXPECTED_ROWS'),
        ),
        activityDate: requiredEnvironment('CRM_ACTIVITY_IMPORT_DATE'),
        timeZone: requiredEnvironment('CRM_ACTIVITY_IMPORT_TIME_ZONE'),
        importId: requiredEnvironment('CRM_ACTIVITY_IMPORT_ID'),
      },
      identityArtifact,
      mode,
      confirmation: process.env.CRM_ACTIVITY_IMPORT_CONFIRMATION,
      expectedManifest: parseExpectedManifest(),
    },
  );
  await writeActivityImportResult(paths.resultPath, result);

  expect(result.plannedCount).toBe(result.manifest.expectedRows);
  if (mode === 'apply') expect(result.status).toBe('complete');
});
