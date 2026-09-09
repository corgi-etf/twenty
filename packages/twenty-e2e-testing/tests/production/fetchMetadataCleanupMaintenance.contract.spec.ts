import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const maintenanceSource = readFileSync(
  join(__dirname, 'fetchMetadataCleanup.maintenance.spec.ts'),
  'utf8',
);

test('binds destructive cleanup to the approved origin and canonical tenant preflight', () => {
  expect(maintenanceSource).toContain('CANONICALIZATION_APPROVED_ORIGIN');
  expect(maintenanceSource).toContain(
    'FRONTEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN',
  );
  expect(maintenanceSource).toContain(
    'BACKEND_BASE_URL !== CANONICALIZATION_APPROVED_ORIGIN',
  );

  const tenantPreflightIndex = maintenanceSource.indexOf(
    'await assertCanonicalizationTenant({',
  );
  const cleanupIndex = maintenanceSource.indexOf(
    'await runFetchMetadataCleanup(',
  );

  expect(tenantPreflightIndex).toBeGreaterThan(-1);
  expect(cleanupIndex).toBeGreaterThan(tenantPreflightIndex);
  expect(maintenanceSource).toContain(
    'expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID',
  );
  expect(maintenanceSource).not.toContain('currentWorkspace');
  expect(maintenanceSource).not.toContain(
    'fetchMetadataCleanupWorkspacePreflight',
  );
});
