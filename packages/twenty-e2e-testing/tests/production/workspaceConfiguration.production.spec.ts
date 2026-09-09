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

test.skip(
  process.env.CRM_WORKSPACE_CONFIG_VERIFICATION_ENABLED !== 'true',
  'Workspace configuration verification runs after the guarded configuration workflow.',
);

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

  await page.goto('/wholesalers/map');
  await expect(
    page.getByRole('heading', { name: 'Territory map' }),
  ).toBeVisible();
  const territoryFilters = page.locator('[aria-label="Territory filters"]');
  await expect(territoryFilters).toBeVisible();
  for (const filterLabel of ['State', 'ZIP code', 'Country', 'Wholesaler']) {
    await expect(
      territoryFilters.getByText(filterLabel, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByTestId('wholesaler-map-located-count')).toBeVisible();
  await expect(page.getByTestId('wholesaler-coverage-map-ready')).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'The interactive map could not load' }),
  ).toHaveCount(0);
  const mappedLeads = page.locator('aside[aria-label="Mapped leads"]');
  await expect(mappedLeads).toBeVisible();
  const mappedLeadList = mappedLeads.getByRole('list');
  await expect(mappedLeadList).toBeVisible();
  await mappedLeadList.getByRole('button').first().click();
  const selectedCompanyDetails = page.getByTestId('territory-company-details');
  await expect(selectedCompanyDetails).toBeVisible();
  for (const detailLabel of [
    'Wholesaler',
    'Territory',
    'Phone',
    'Location',
    'State',
    'ZIP',
    'Address',
    'LinkedIn',
    'Notes',
  ]) {
    await expect(
      selectedCompanyDetails.getByText(detailLabel, { exact: true }),
    ).toBeVisible();
  }
  await expect(
    selectedCompanyDetails.getByRole('button', {
      name: 'Open full company record',
    }),
  ).toBeVisible();

  const companyId = companies[0]?.id;
  expect(companyId).toBeTruthy();
  await page.goto(`/object/company/${companyId}`);

  const quickLogAction = page.getByRole('button', {
    name: 'Log a follow-up for this company',
  });
  await expect(quickLogAction).toBeVisible();
  await expect(quickLogAction).toBeEnabled();
  await quickLogAction.click();

  const quickLogDialog = page.getByRole('dialog', { name: 'Log follow-up' });
  await expect(quickLogDialog).toBeVisible();
  for (const fieldLabel of [
    'Activity',
    'Outcome',
    'Contact person',
    'Notes',
    'Next follow-up (optional)',
  ]) {
    await expect(
      quickLogDialog.getByText(fieldLabel, { exact: true }),
    ).toBeVisible();
  }
  await expect(
    quickLogDialog.getByText(/wholesaler profile is linked/i),
  ).toHaveCount(0);
});
