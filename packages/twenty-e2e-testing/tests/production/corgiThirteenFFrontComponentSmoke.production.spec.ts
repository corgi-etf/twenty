import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPROVED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const APPROVED_WORKSPACE_NAME = 'Corgi ETF';
const PAGE_LAYOUT_UNIVERSAL_IDENTIFIER = '6404c75f-c713-4db1-965d-6cf54178a18f';
const FRONT_COMPONENT_ERROR_PREFIX = 'FrontComponent error:';
const ERROR_PROBE_KEY = '__corgiThirteenFFrontComponentErrorSeen';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MetadataSnapshot = {
  currentWorkspace?: { id?: string; displayName?: string };
  currentUser?: {
    currentWorkspace?: { id?: string; displayName?: string };
    currentUserWorkspace?: {
      id?: string;
      isImpersonating?: boolean;
    };
  };
  getPageLayouts?: Array<{
    id?: string;
    universalIdentifier?: string;
    name?: string;
    type?: string;
  }>;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const readJson = async <T>(
  response: APIResponse,
  label: string,
): Promise<T> => {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}`);
  }
  return (await response.json()) as T;
};

const clickNativeFrontComponentButton = async (
  page: Page,
  button: Locator,
): Promise<void> => {
  await expect(button).toBeVisible();

  const nativeState = await button.evaluate((element) => ({
    disabled:
      element instanceof HTMLButtonElement ? element.disabled : undefined,
    tagName: element.tagName,
  }));

  expect(nativeState).toEqual({ disabled: false, tagName: 'BUTTON' });

  // Twenty's non-editable sortable widget wrapper exposes aria-disabled=true.
  // Playwright inherits that ARIA state and rejects locator.click(), even though
  // the native button remains pointer-interactive for an end user.
  await button.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  const box = await button.boundingBox();

  expect(box).not.toBeNull();
  if (!box) throw new Error('FrontComponent button has no rendered bounds');

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const readButtonLabel = async (button: Locator): Promise<string> => {
  const label = (await button.textContent())?.trim();

  expect(label).toBeTruthy();
  if (!label) throw new Error('FrontComponent button has no accessible label');

  return label;
};

const resolvePageLayout = async (page: Page, origin: string) => {
  const response = await page.request.post(new URL('/metadata', origin).href, {
    headers: { Origin: origin },
    data: {
      operationName: 'VerifyCorgiThirteenFRenderedPage',
      query: `query VerifyCorgiThirteenFRenderedPage {
        currentWorkspace { id displayName }
        currentUser {
          currentWorkspace { id displayName }
          currentUserWorkspace { id isImpersonating }
        }
        getPageLayouts(pageLayoutType: STANDALONE_PAGE) {
          id
          universalIdentifier
          name
          type
        }
      }`,
    },
  });
  const body = await readJson<{
    data?: MetadataSnapshot;
    errors?: unknown[];
  }>(response, 'Corgi 13F rendered-page metadata');

  expect(body.errors).toBeUndefined();
  expect(body.data?.currentWorkspace).toEqual({
    id: APPROVED_WORKSPACE_ID,
    displayName: APPROVED_WORKSPACE_NAME,
  });
  expect(body.data?.currentUser?.currentWorkspace).toEqual({
    id: APPROVED_WORKSPACE_ID,
    displayName: APPROVED_WORKSPACE_NAME,
  });
  expect(body.data?.currentUser?.currentUserWorkspace).toMatchObject({
    id: requiredEnvironment('CORGI_CRM_EXPECTED_USER_WORKSPACE_ID'),
    isImpersonating: false,
  });

  const matches = (body.data?.getPageLayouts ?? []).filter(
    ({ universalIdentifier }) =>
      universalIdentifier === PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({
    universalIdentifier: PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
    name: '13F',
    type: 'STANDALONE_PAGE',
  });
  expect(matches[0].id).toMatch(UUID_PATTERN);

  return matches[0];
};

test.describe.configure({ retries: 0 });

test.skip(
  process.env.CORGI_THIRTEEN_F_FRONT_COMPONENT_SMOKE?.trim() !== 'true',
  'Corgi 13F rendered-page verification is workflow-only.',
);

test('renders and navigates the native 13F page without a FrontComponent runtime error', async ({
  page,
}) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  expect(origin).toBe(APPROVED_ORIGIN);
  expect(requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID')).toBe(
    APPROVED_WORKSPACE_ID,
  );

  const pageLayout = await resolvePageLayout(page, origin);

  await page.addInitScript(
    ({ errorPrefix, probeKey }) => {
      const runtimeWindow = window as unknown as Record<string, unknown>;
      runtimeWindow[probeKey] = false;

      const recordFrontComponentError = () => {
        if (document.body?.textContent?.includes(errorPrefix)) {
          runtimeWindow[probeKey] = true;
        }
      };
      const observeDocument = () => {
        recordFrontComponentError();
        new MutationObserver(recordFrontComponentError).observe(
          document.documentElement,
          {
            characterData: true,
            childList: true,
            subtree: true,
          },
        );
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeDocument, {
          once: true,
        });
      } else {
        observeDocument();
      }
    },
    {
      errorPrefix: FRONT_COMPONENT_ERROR_PREFIX,
      probeKey: ERROR_PROBE_KEY,
    },
  );

  await page.goto(new URL(`/page/${pageLayout.id}`, origin).href, {
    waitUntil: 'domcontentloaded',
  });

  await expect(
    page.getByRole('heading', { name: '13F', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[aria-label="Search 13F data"]')).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(page.getByRole('region', { name: '13F firms' })).toBeVisible({
    timeout: 30_000,
  });

  const firmDirectory = page.getByRole('region', { name: '13F firms' });
  const directoryFirmButton = firmDirectory.getByRole('button').first();
  const directoryFirmName = await readButtonLabel(directoryFirmButton);

  await clickNativeFrontComponentButton(page, directoryFirmButton);

  const firmHoldings = page.getByRole('table', { name: 'Firm holdings' });
  await expect(firmHoldings).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('heading', {
      name: directoryFirmName,
      exact: true,
    }),
  ).toBeVisible();

  const tickerButton = firmHoldings.getByRole('button').first();
  const ticker = await readButtonLabel(tickerButton);

  await clickNativeFrontComponentButton(page, tickerButton);

  const securityHoldingFirms = page.getByRole('table', {
    name: 'Security holding firms',
  });
  await expect(securityHoldingFirms).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('heading', {
      name: `Firms holding ${ticker}`,
      exact: true,
    }),
  ).toBeVisible();

  const holderFirmButton = securityHoldingFirms.getByRole('button').first();
  const holderFirmName = await readButtonLabel(holderFirmButton);

  await clickNativeFrontComponentButton(page, holderFirmButton);

  await expect(page.getByRole('table', { name: 'Firm holdings' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('heading', { name: holderFirmName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(FRONT_COMPONENT_ERROR_PREFIX)).toHaveCount(0);
  expect(
    await page.evaluate(
      (probeKey) =>
        Boolean((window as unknown as Record<string, unknown>)[probeKey]),
      ERROR_PROBE_KEY,
    ),
  ).toBe(false);
});
