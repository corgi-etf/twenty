import { expect, test, type Page } from '@playwright/test';

import { requireProductionEnvironment } from './requireProductionEnvironment';

const destroyPerson = async ({
  page,
  personId,
}: {
  page: Page;
  personId: string;
}) => {
  const { BACKEND_BASE_URL, FRONTEND_BASE_URL } =
    requireProductionEnvironment();
  const response = await page.request.post(
    new URL('/graphql', BACKEND_BASE_URL).toString(),
    {
      headers: {
        Origin: new URL(FRONTEND_BASE_URL).origin,
      },
      data: {
        operationName: 'DestroyProductionSmokePerson',
        query: `mutation DestroyProductionSmokePerson($idToDestroy: UUID!) {
        destroyPerson(id: $idToDestroy) {
          id
        }
      }`,
        variables: { idToDestroy: personId },
      },
    },
  );

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    data?: { destroyPerson?: { id?: string } };
    errors?: unknown;
  };

  expect(body.errors).toBeUndefined();
  expect(body.data?.destroyPerson?.id).toBe(personId);
};

test.beforeAll(() => {
  requireProductionEnvironment();
});

test('loads the authenticated workspace and wholesaler coverage map', async ({
  page,
}) => {
  await page.goto('/objects/companies');
  await expect(
    page.getByRole('button', { name: 'Create new Company' }),
  ).toBeVisible();

  await page.goto('/wholesalers/map');
  await expect(
    page.getByRole('heading', { name: 'Wholesaler coverage' }),
  ).toBeVisible();

  const map = page.getByTestId('wholesaler-coverage-map');

  await expect(map).toBeVisible();
  await expect(map.locator('canvas')).toBeVisible();
  await expect(
    page.getByText('Unable to load wholesaler coverage'),
  ).not.toBeVisible();
  await expect(page.getByTestId('wholesaler-map-located-count')).toContainText(
    /^[1-9][\d,]* mapped leads$/,
  );
});

test('creates, verifies, and removes a person through the production UI', async ({
  page,
}) => {
  const uniqueSuffix = `${Date.now()}-${test.info().retry}`;
  const firstName = 'CRM E2E';
  const lastName = `Smoke ${uniqueSuffix}`;
  let personId: string | undefined;

  await page.goto('/objects/people');

  try {
    await page.getByRole('button', { name: 'Create new Person' }).click();
    await page.getByRole('textbox', { name: 'F‌‌irst name' }).fill(firstName);
    await page.getByPlaceholder('L‌‌ast name').fill(lastName);
    await page.getByPlaceholder('L‌‌ast name').press('Enter');

    await expect(page.getByTestId('record-fields-widget')).toBeVisible();
    await page.getByRole('button', { name: 'Expand record' }).click();
    await page.waitForURL(/\/object\/person\/[a-f0-9-]+/);

    personId = page.url().match(/\/object\/person\/([a-f0-9-]+)/)?.[1];
    expect(personId).toBeTruthy();
    await expect(
      page.getByText(`${firstName} ${lastName}`, { exact: true }),
    ).toBeVisible();
  } finally {
    if (personId) {
      await destroyPerson({ page, personId });
    }
  }
});
