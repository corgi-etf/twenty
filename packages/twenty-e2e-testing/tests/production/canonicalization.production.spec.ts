import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  assertTrustedManifestShape,
  runCanonicalization,
} from '../../../corgi-crm-canonicalization/src/execution.ts';
import { preflightCanonicalizationArtifacts } from '../../../corgi-crm-canonicalization/src/execution-artifacts.ts';
import type { ReconciliationManifest } from '../../../corgi-crm-canonicalization/src/reconciliation.ts';
import { CANONICALIZATION_APPROVED_ORIGIN } from '../../../corgi-crm-canonicalization/src/twenty-rest-api.ts';
import { createCanonicalizationRequestGate } from '../../../corgi-crm-canonicalization/src/request-gate.ts';
import {
  assertCanonicalizationTenant,
  CANONICALIZATION_APPROVED_WORKSPACE_ID,
} from '../../../corgi-crm-canonicalization/src/tenant-preflight.ts';
import { createPlaywrightCanonicalizationApi } from './playwrightCanonicalizationApi.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment.ts';

const expectedManifest = (): ReconciliationManifest | undefined => {
  const serialized = process.env.CRM_CANONICALIZATION_EXPECTED_MANIFEST;
  if (!serialized) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('CRM_CANONICALIZATION_EXPECTED_MANIFEST is invalid JSON');
  }
  assertTrustedManifestShape(parsed);

  return parsed;
};

test('runs the guarded CRM canonicalization maintenance operation', async ({
  page,
}) => {
  test.skip(
    process.env.CRM_CANONICALIZATION_ENABLED !== 'true',
    'Canonicalization is disabled unless explicitly enabled',
  );
  test.setTimeout(2 * 60 * 60_000);

  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  if (
    FRONTEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN ||
    BACKEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN
  ) {
    throw new Error('Production canonicalization origin is not approved');
  }
  const mode = process.env.CRM_CANONICALIZATION_MODE ?? 'dry-run';
  if (mode !== 'dry-run' && mode !== 'apply') {
    throw new Error('CRM_CANONICALIZATION_MODE must be dry-run or apply');
  }
  const { resultPath } = await preflightCanonicalizationArtifacts({
    runnerTemp: process.env.RUNNER_TEMP ?? '',
    checkpointPath: process.env.CRM_CANONICALIZATION_CHECKPOINT_PATH ?? '',
    resultPath: process.env.CRM_CANONICALIZATION_RESULT_PATH ?? '',
  });
  const expectedWorkspaceId =
    process.env.CRM_CANONICALIZATION_WORKSPACE_ID ?? '';
  if (expectedWorkspaceId !== CANONICALIZATION_APPROVED_WORKSPACE_ID) {
    throw new Error('Canonicalization workspace ID is not approved');
  }
  const requestGate = createCanonicalizationRequestGate();
  await assertCanonicalizationTenant({
    request: page.request,
    requestGate,
    origin: FRONTEND_BASE_URL,
    expectedWorkspaceId,
  });
  const api = createPlaywrightCanonicalizationApi({
    page,
    backendBaseUrl: BACKEND_BASE_URL,
    frontendBaseUrl: FRONTEND_BASE_URL,
    requestGate,
  });
  const result = await runCanonicalization(api, {
    origin: FRONTEND_BASE_URL,
    expectedOrigin: CANONICALIZATION_APPROVED_ORIGIN,
    mode,
    confirmation: process.env.CRM_CANONICALIZATION_CONFIRMATION,
    expectedManifest: expectedManifest(),
    enforceProductionBaseline: true,
  });

  await mkdir(dirname(resultPath), { recursive: true });
  const temporaryPath = `${resultPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, resultPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  expect(result.unresolved).toBe(0);
  if (mode === 'apply') {
    expect(result.reconciliation.remainingMutations).toBe(0);
  }
});
