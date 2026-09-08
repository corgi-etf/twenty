import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  assertTrustedManifestShape,
  runCanonicalization,
} from '../../../corgi-crm-canonicalization/src/execution.ts';
import type { ReconciliationManifest } from '../../../corgi-crm-canonicalization/src/reconciliation.ts';
import { createPlaywrightCanonicalizationApi } from './playwrightCanonicalizationApi.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment.ts';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';

const requiredRunPath = (variableName: string): string => {
  const runnerTemp = process.env.RUNNER_TEMP;
  const configured = process.env[variableName];
  if (!runnerTemp || !configured) {
    throw new Error(`${variableName} and RUNNER_TEMP are required`);
  }
  const root = resolve(runnerTemp);
  const path = resolve(configured);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`${variableName} must be inside RUNNER_TEMP`);
  }

  return path;
};

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
  if (FRONTEND_BASE_URL !== APPROVED_ORIGIN) {
    throw new Error('Production canonicalization origin is not approved');
  }
  const mode = process.env.CRM_CANONICALIZATION_MODE ?? 'dry-run';
  if (mode !== 'dry-run' && mode !== 'apply') {
    throw new Error('CRM_CANONICALIZATION_MODE must be dry-run or apply');
  }
  requiredRunPath('CRM_CANONICALIZATION_CHECKPOINT_PATH');
  const resultPath = requiredRunPath('CRM_CANONICALIZATION_RESULT_PATH');
  const api = createPlaywrightCanonicalizationApi({
    page,
    backendBaseUrl: BACKEND_BASE_URL,
    frontendBaseUrl: FRONTEND_BASE_URL,
  });
  const result = await runCanonicalization(api, {
    origin: FRONTEND_BASE_URL,
    expectedOrigin: APPROVED_ORIGIN,
    mode,
    confirmation: process.env.CRM_CANONICALIZATION_CONFIRMATION,
    expectedManifest: expectedManifest(),
    enforceProductionBaseline: true,
  });

  await mkdir(dirname(resultPath), { recursive: true });
  const temporaryPath = `${resultPath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, resultPath);

  expect(result.unresolved).toBe(0);
  if (mode === 'apply') {
    expect(result.reconciliation.remainingMutations).toBe(0);
  }
});
