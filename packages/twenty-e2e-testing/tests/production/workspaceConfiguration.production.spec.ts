import { expect, test } from '@playwright/test';

import {
  buildTerritoryProjectionPlan,
  buildWorkspaceConfigPlan,
  workspaceConfigOperationCount,
} from '../../../corgi-crm-workspace-config/src/planner.ts';
import {
  assertWorkspaceConfigTenant,
  createTwentyWorkspaceConfigApi,
  createWorkspaceConfigRequestGate,
} from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import { requireProductionEnvironment } from './requireProductionEnvironment';

test.beforeAll(() => {
  requireProductionEnvironment();
});

test('keeps the production CRM territory-first and free of helper navigation', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const origin = new URL(FRONTEND_BASE_URL).origin;
  const requestGate = createWorkspaceConfigRequestGate();
  await assertWorkspaceConfigTenant({
    request: page.request,
    origin,
    requestGate,
  });
  const api = createTwentyWorkspaceConfigApi({
    request: page.request,
    backendBaseUrl: BACKEND_BASE_URL,
    frontendBaseUrl: FRONTEND_BASE_URL,
    checkpointFilePath: '/not-used-by-read-only-hygiene-test',
    requestGate,
  });
  const snapshot = await api.listWorkspaceConfigSnapshot();
  const plan = buildWorkspaceConfigPlan(snapshot);
  expect(plan.layout).not.toBeNull();
  expect(workspaceConfigOperationCount(plan)).toBe(0);

  const companies = await api.listCompanies();
  expect(companies.length).toBeGreaterThanOrEqual(2191);
  const projection = buildTerritoryProjectionPlan(companies, companies.length);
  expect(projection.mutations).toHaveLength(0);

  await page.goto('/objects/companies');
  await expect(
    page.getByRole('button', { name: 'Create new Company' }),
  ).toBeVisible();
  for (const label of [
    'Companies',
    'People',
    'Wholesalers',
    'Sales Teams',
    'Follow-ups',
    'Territory map',
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const forbiddenLabel of [
    'Import Batches',
    'Source Records',
    'Import Review Items',
    'Team Memberships',
  ]) {
    await expect(page.getByText(forbiddenLabel, { exact: true })).toHaveCount(
      0,
    );
  }
});
