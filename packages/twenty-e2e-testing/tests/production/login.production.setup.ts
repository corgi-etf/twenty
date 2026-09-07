import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'fs/promises';
import path from 'path';

import { LoginPage } from '../../lib/pom/loginPage';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const AUTH_STATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.auth',
  'production-user.json',
);

setup('authenticate the production smoke-test user', async ({ page }) => {
  const { CRM_E2E_LOGIN, CRM_E2E_PASSWORD } = requireProductionEnvironment();
  const loginPage = new LoginPage(page);

  await page.goto('/');
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(CRM_E2E_LOGIN);
  await loginPage.clickContinueButton();
  await loginPage.typePassword(CRM_E2E_PASSWORD);
  await loginPage.clickSignInButton();

  const workspaceSelectionTitle = page.getByRole('heading', {
    name: 'Choose a Workspace',
  });

  if (
    await workspaceSelectionTitle
      .isVisible({ timeout: 10_000 })
      .catch(() => false)
  ) {
    const workspaceName = process.env.CRM_E2E_WORKSPACE_NAME;

    if (workspaceName) {
      await page.getByText(workspaceName, { exact: true }).click();
    } else {
      await page.locator('a[href*="loginToken="]').first().click();
    }
  }

  await page.waitForURL(/\/objects\//, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Create new / })).toBeVisible();

  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
