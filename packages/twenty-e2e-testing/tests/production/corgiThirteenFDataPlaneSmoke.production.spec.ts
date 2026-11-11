import { expect, test, type APIResponse, type Page } from '@playwright/test';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPROVED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const APPROVED_WORKSPACE_NAME = 'Corgi ETF';
const DATA_PLANE_PATH = '/s/thirteen-f/query';
const STABLE_TICKER_QUERY = 'ITA';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const RAW_FILE_ARTIFACT_PATTERN =
  /\.(?:xlsx?|csv)\b|\b(?:workbook|worksheet)\b|\b(?:download|file)(?:Href|Name|Path|Url)\b|\b(?:rawFile|sourceFile)(?:Id|Name|Path|Url)?\b|\b(?:object|s3|storage)Key\b/i;

const MINIMUM_COUNTS = {
  managers: 4_610,
  filings: 5_631,
  securities: 297,
  holdings: 28_320,
  completedIngestions: 1,
} as const;

type TenantSnapshot = {
  currentWorkspace?: { id?: string; displayName?: string };
  currentUser?: {
    currentWorkspace?: { id?: string; displayName?: string };
    currentUserWorkspace?: {
      id?: string;
      isImpersonating?: boolean;
    };
  };
};

type Summary = {
  periods?: Array<{ asOfDate?: string; dateBasis?: string }>;
  latestAsOfDate?: string | null;
  counts?: {
    managers?: number;
    filings?: number;
    securities?: number;
    holdings?: number;
    completedIngestions?: number;
    failedIngestions?: number;
  };
};

type PageEnvelope<T> = {
  items?: T[];
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean };
  totalCount?: number;
};

type FirmSummary = {
  id?: string;
  legalName?: string;
  latestAsOfDate?: string;
  latestDateBasis?: string;
  positionCount?: number;
  topHoldings?: unknown[];
};

type FirmDetail = FirmSummary & {
  filingHistory?: Array<{ id?: string; asOfDate?: string }>;
};

type Holding = {
  id?: string;
  firmId?: string;
  firmName?: string;
  filingId?: string;
  asOfDate?: string;
  securityId?: string;
  issuerName?: string | null;
  ticker?: string | null;
  cusip?: string | null;
};

type SearchResults = {
  firms?: FirmSummary[];
  securities?: Array<{
    id?: string;
    issuerName?: string | null;
    ticker?: string | null;
    cusip?: string | null;
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

const proveTenant = async (page: Page, origin: string): Promise<void> => {
  const response = await page.request.post(new URL('/metadata', origin).href, {
    headers: { Origin: origin },
    data: {
      operationName: 'VerifyCorgiThirteenFDataPlaneTenant',
      query: `query VerifyCorgiThirteenFDataPlaneTenant {
        currentWorkspace { id displayName }
        currentUser {
          currentWorkspace { id displayName }
          currentUserWorkspace { id isImpersonating }
        }
      }`,
    },
  });
  const body = await readJson<{
    data?: TenantSnapshot;
    errors?: unknown[];
  }>(response, 'Corgi 13F tenant proof');

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
};

const assertNoRawFileArtifacts = (value: unknown): void => {
  expect(JSON.stringify(value)).not.toMatch(RAW_FILE_ARTIFACT_PATTERN);
};

test.describe.configure({ retries: 0 });

test.skip(
  process.env.CORGI_THIRTEEN_F_DATA_PLANE_SMOKE?.trim() !== 'true',
  'Corgi 13F data-plane verification is workflow-only.',
);

test('serves native firm and reverse-holding data through the authenticated CRM app', async ({
  page,
}) => {
  const origin = new URL(requiredEnvironment('FRONTEND_BASE_URL')).origin;
  expect(origin).toBe(APPROVED_ORIGIN);
  expect(requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID')).toBe(
    APPROVED_WORKSPACE_ID,
  );
  await proveTenant(page, origin);

  const query = async <T>(body: Record<string, unknown>, label: string) => {
    const response = await page.request.post(
      new URL(DATA_PLANE_PATH, origin).href,
      {
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        data: body,
      },
    );
    const result = await readJson<T>(response, label);
    assertNoRawFileArtifacts(result);
    return result;
  };

  const summary = await query<Summary>({ action: 'summary' }, '13F summary');
  expect(summary.periods?.length).toBeGreaterThan(0);
  expect(summary.latestAsOfDate).toMatch(DATE_PATTERN);
  expect(summary.counts?.managers).toBeGreaterThanOrEqual(
    MINIMUM_COUNTS.managers,
  );
  expect(summary.counts?.filings).toBeGreaterThanOrEqual(
    MINIMUM_COUNTS.filings,
  );
  expect(summary.counts?.securities).toBeGreaterThanOrEqual(
    MINIMUM_COUNTS.securities,
  );
  expect(summary.counts?.holdings).toBeGreaterThanOrEqual(
    MINIMUM_COUNTS.holdings,
  );
  expect(summary.counts?.completedIngestions).toBeGreaterThanOrEqual(
    MINIMUM_COUNTS.completedIngestions,
  );
  expect(summary.counts?.failedIngestions).toBe(0);
  const asOfDate = summary.latestAsOfDate!;
  const firms = await query<PageEnvelope<FirmSummary>>(
    { action: 'firms', asOfDate, limit: 1 },
    '13F firm directory',
  );
  expect(firms.totalCount).toBeGreaterThan(0);
  expect(firms.items).toHaveLength(1);
  const firm = firms.items![0];
  expect(firm.id).toMatch(UUID_PATTERN);
  expect(firm.legalName?.trim().length).toBeGreaterThan(0);
  expect(firm.latestAsOfDate).toBe(asOfDate);
  expect(firm.positionCount).toBeGreaterThan(0);

  const detail = await query<FirmDetail>(
    { action: 'firm', firmId: firm.id },
    '13F firm detail',
  );
  expect(detail.id).toBe(firm.id);
  expect(detail.legalName).toBe(firm.legalName);
  expect(detail.filingHistory?.length).toBeGreaterThan(0);
  expect(
    detail.filingHistory?.some((filing) => filing.asOfDate === asOfDate),
  ).toBe(true);

  const holdings = await query<PageEnvelope<Holding>>(
    {
      action: 'holdings',
      firmId: firm.id,
      asOfDate,
      limit: 10,
      order: 'value_desc',
    },
    '13F firm holdings',
  );
  expect(holdings.totalCount).toBeGreaterThan(0);
  expect(holdings.items?.length).toBeGreaterThan(0);
  for (const holding of holdings.items ?? []) {
    expect(holding.id).toMatch(UUID_PATTERN);
    expect(holding.firmId).toBe(firm.id);
    expect(holding.filingId).toMatch(UUID_PATTERN);
    expect(holding.asOfDate).toBe(asOfDate);
    expect(holding.securityId).toMatch(UUID_PATTERN);
    expect(
      Boolean(
        holding.issuerName?.trim() ||
        holding.ticker?.trim() ||
        holding.cusip?.trim(),
      ),
    ).toBe(true);
  }

  const search = await query<SearchResults>(
    { action: 'search', q: STABLE_TICKER_QUERY, limit: 10 },
    '13F ticker search',
  );
  const security = search.securities?.find(
    ({ ticker }) => ticker?.toUpperCase() === STABLE_TICKER_QUERY,
  );
  expect(security?.id).toMatch(UUID_PATTERN);

  const holders = await query<PageEnvelope<Holding>>(
    {
      action: 'holders',
      securityId: security!.id,
      asOfDate,
      mode: 'exact',
      limit: 10,
    },
    '13F reverse holders',
  );
  expect(holders.totalCount).toBeGreaterThan(0);
  expect(holders.items?.length).toBeGreaterThan(0);
  for (const holding of holders.items ?? []) {
    expect(holding.securityId).toBe(security!.id);
    expect(holding.ticker?.toUpperCase()).toBe(STABLE_TICKER_QUERY);
    expect(holding.firmId).toMatch(UUID_PATTERN);
    expect(holding.firmName?.trim().length).toBeGreaterThan(0);
    expect(holding.asOfDate).toBe(asOfDate);
  }
});
