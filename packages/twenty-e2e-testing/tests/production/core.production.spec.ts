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
  await expect(page.getByTestId('wholesaler-coverage-map-ready')).toBeVisible();
  await expect(map.locator('canvas')).toBeVisible();
  await expect(
    page.getByText('Lead locations could not be loaded.'),
  ).not.toBeVisible();
  await expect(
    page.getByText(
      'The interactive map could not load. Use the lead list beside it to open every mapped company.',
    ),
  ).not.toBeVisible();
  const mappedCount = page.getByTestId('wholesaler-map-located-count');

  await expect(mappedCount).toContainText(/^[1-9][\d,]* mapped leads/);
  const allWholesalersCountText = await mappedCount.textContent();
  const allWholesalersCount = Number(
    allWholesalersCountText
      ?.match(/^([\d,]+) mapped leads/)?.[1]
      .replaceAll(',', '') ?? 0,
  );
  const mappedLeadList = page.getByRole('complementary', {
    name: 'Mapped leads',
  });
  const mappedLeadButtons = mappedLeadList.getByRole('button');
  const mappedWholesalerName = (await mappedLeadButtons.allTextContents())
    .map((leadText) => leadText.split(' · ').at(-1)?.trim())
    .find(
      (ownerName) =>
        ownerName !== undefined &&
        ownerName.length > 0 &&
        ownerName !== 'Unassigned',
    );

  await expect(page.getByText('Wholesaler', { exact: true })).toBeVisible();
  expect(mappedWholesalerName).toBeTruthy();
  await page.getByText('All wholesalers', { exact: true }).click();

  const wholesalerOption = page.getByRole('option', {
    name: mappedWholesalerName ?? '',
    exact: true,
  });

  await expect(wholesalerOption).toBeVisible();
  await wholesalerOption.click();
  await expect(
    page.getByText(mappedWholesalerName ?? '', { exact: true }).first(),
  ).toBeVisible();
  await expect(mappedCount).toContainText(/^[1-9][\d,]* mapped leads/);

  const selectedWholesalerCountText = await mappedCount.textContent();
  const selectedWholesalerCount = Number(
    selectedWholesalerCountText
      ?.match(/^([\d,]+) mapped leads/)?.[1]
      .replaceAll(',', '') ?? 0,
  );

  expect(selectedWholesalerCount).toBeGreaterThan(0);
  expect(selectedWholesalerCount).toBeLessThanOrEqual(allWholesalersCount);
  await expect
    .poll(async () => {
      const visibleLeadTexts = await mappedLeadButtons.allTextContents();

      return (
        visibleLeadTexts.length > 0 &&
        visibleLeadTexts.every((leadText) =>
          leadText.trim().endsWith(mappedWholesalerName ?? ''),
        )
      );
    })
    .toBe(true);

  await page
    .getByText(mappedWholesalerName ?? '', { exact: true })
    .first()
    .click();
  await page.getByRole('option', { name: 'All wholesalers' }).click();
  await expect(mappedCount).toHaveText(allWholesalersCountText ?? '');

  await mappedLeadButtons.first().click();
  await page.waitForURL(/\/object\/company\/[a-f0-9-]+/);
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
      page.getByText(`${firstName} ${lastName}`, { exact: true }).first(),
    ).toBeVisible();
  } finally {
    if (personId) {
      await destroyPerson({ page, personId });
    }
  }
});
