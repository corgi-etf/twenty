import { expect, test } from '@playwright/test';
import {
  type CorgiClientCompany,
  type CorgiHomeSummary,
  type CorgiPage,
} from 'twenty-shared/types';

test.describe.configure({ retries: 0 });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(
  process.env.CRM_EXPERIENCE_VERIFICATION_ENABLED !== 'true',
  'Run after the reviewed experience rollout has completed.',
);

test('opens Home, reconciles allocated clients, and cancels a company draft', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const homeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/rest/corgi-crm/home' && !url.search;
  });
  await page.goto('/home');
  const response = await homeResponse;
  expect(response.ok()).toBe(true);
  const { data: summary } = (await response.json()) as {
    data: CorgiHomeSummary;
  };
  expect(summary.enabled).toBe(true);
  for (const metric of Object.values(summary.today.metrics)) {
    expect(metric.status).toBe('available');
  }
  expect(summary.latestRecords.status).toBe('available');
  expect(summary.latestRecords.records.length).toBeLessThanOrEqual(5);
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'My follow-up companies', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Follow-up status', { exact: true }),
  ).toHaveValue('open');
  await page
    .getByLabel('Follow-up status', { exact: true })
    .selectOption('all');
  await expect(
    page.getByLabel('Follow-up status', { exact: true }),
  ).toHaveValue('all');

  const clientsTile = page.getByRole('link', { name: /^Current clients/ });
  await expect(clientsTile).toHaveAttribute('aria-disabled', 'false');
  await expect(clientsTile).toContainText(
    summary.today.metrics.currentClients.count!.toLocaleString('en-US'),
  );
  const clientsResponse = page.waitForResponse((result) => {
    const url = new URL(result.url());
    return (
      url.pathname === '/rest/corgi-crm/home' &&
      url.searchParams.get('section') === 'currentClients'
    );
  });
  await clientsTile.click();
  const result = await clientsResponse;
  expect(result.ok()).toBe(true);
  const { data: clients } = (await result.json()) as {
    data: CorgiPage<CorgiClientCompany>;
  };
  expect(clients.status).toBe('available');
  expect(clients.totalCount).toBe(summary.today.metrics.currentClients.count);
  await expect(
    page.getByRole('heading', { name: 'Current clients', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`Page 1 · ${clients.totalCount} results`, { exact: true }),
  ).toBeVisible();
  if (clients.records.length > 0) {
    const company = clients.records[0].company;
    const companyLink = page
      .locator(`a[href="/object/company/${company.id}"]`)
      .first();
    const expanded = page.locator('details').filter({ has: companyLink });
    await expanded.locator('summary').press('Enter');
    await expect(
      expanded.getByRole('heading', {
        name: 'Credited salesperson / wholesaler',
      }),
    ).toBeVisible();
    await expect(
      expanded.getByRole('heading', { name: 'Client contact', exact: true }),
    ).toBeVisible();
    await expect(
      expanded.getByRole('link', { name: 'View all company allocations' }),
    ).toBeVisible();
    await companyLink.click();
    await expect(page).toHaveURL(new RegExp(`/object/company/${company.id}$`));
    await expect(
      page.getByRole('complementary', { name: 'CRM daily overview' }),
    ).toBeVisible();
  }

  await page.goto('/home');
  const companyCreates: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\bcreate(?:One)?Company\s*\(/i.test(request.postData() ?? '')
    ) {
      companyCreates.push(request.url());
    }
  });
  await page
    .getByRole('button', { name: 'Create company', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Create Company',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel('Name', { exact: true })
    .fill('Unsaved rollout verification draft');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible();
  expect(companyCreates).toEqual([]);
});
