import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { THIRTEEN_F_QUERY_LOGIC_FUNCTION_ID } from 'src/constants/universal-identifiers';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const QUERY_ROOT = '/api/internal/thirteen-f';
const MAX_QUERY_LENGTH = 200;
const MAX_CURSOR_LENGTH = 500;
const MAX_PAGE_SIZE = 100;
const APPROVED_API_ORIGINS = ['https://admin.corgiinvest.com'] as const;

type Fetcher = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<globalThis.Response>;

type QueryContext = { workspaceId?: string };

type QueryDependencies = {
  apiBaseUrl: string | undefined;
  readToken: string | undefined;
  expectedWorkspaceId: string | undefined;
  approvedApiOrigins: readonly string[];
  fetcher: Fetcher;
};

const ACTION_KEYS = {
  summary: ['action'],
  firms: ['action', 'q', 'asOfDate', 'cursor', 'limit'],
  search: ['action', 'q', 'limit'],
  firm: ['action', 'firmId'],
  holdings: [
    'action',
    'firmId',
    'asOfDate',
    'q',
    'cursor',
    'limit',
    'order',
  ],
  holders: [
    'action',
    'securityId',
    'asOfDate',
    'mode',
    'cursor',
    'limit',
  ],
  company: ['action', 'companyId'],
} as const;

type Action = keyof typeof ACTION_KEYS;

const readBody = (payload: unknown): Record<string, unknown> | undefined => {
  const candidate = (payload as { body?: unknown } | undefined)?.body ?? payload;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }
  return candidate as Record<string, unknown>;
};

const isAction = (value: unknown): value is Action =>
  typeof value === 'string' && value in ACTION_KEYS;

const isText = (value: unknown, maxLength: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maxLength;

const isOptionalText = (value: unknown, maxLength: number) =>
  value === undefined || isText(value, maxLength);

const isOptionalDate = (value: unknown) =>
  value === undefined || (typeof value === 'string' && DATE_PATTERN.test(value));

const isOptionalLimit = (value: unknown) =>
  value === undefined ||
  (typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PAGE_SIZE);

const hasOnlyAllowedKeys = (body: Record<string, unknown>, action: Action) => {
  const allowed = new Set<string>(ACTION_KEYS[action]);
  return Object.keys(body).every((key) => allowed.has(key));
};

const isValidBody = (body: Record<string, unknown>, action: Action) => {
  if (!hasOnlyAllowedKeys(body, action)) return false;

  const commonListFieldsAreValid =
    isOptionalText(body.q, MAX_QUERY_LENGTH) &&
    isOptionalDate(body.asOfDate) &&
    isOptionalText(body.cursor, MAX_CURSOR_LENGTH) &&
    isOptionalLimit(body.limit);

  switch (action) {
    case 'summary':
      return true;
    case 'firms':
      return commonListFieldsAreValid;
    case 'search':
      return isText(body.q, MAX_QUERY_LENGTH) && isOptionalLimit(body.limit);
    case 'firm':
      return typeof body.firmId === 'string' && UUID_PATTERN.test(body.firmId);
    case 'holdings':
      return (
        commonListFieldsAreValid &&
        typeof body.firmId === 'string' &&
        UUID_PATTERN.test(body.firmId) &&
        (body.order === undefined ||
          ['value_desc', 'shares_desc', 'ticker_asc'].includes(
            String(body.order),
          ))
      );
    case 'holders':
      return (
        commonListFieldsAreValid &&
        typeof body.securityId === 'string' &&
        UUID_PATTERN.test(body.securityId) &&
        (body.mode === undefined || ['exact', 'latest'].includes(String(body.mode)))
      );
    case 'company':
      return (
        typeof body.companyId === 'string' && UUID_PATTERN.test(body.companyId)
      );
  }
};

const appendOptional = (
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  key: 'q' | 'asOfDate' | 'cursor' | 'limit' | 'order' | 'mode',
) => {
  if (body[key] !== undefined) searchParams.set(key, String(body[key]));
};

const buildRequestUrl = (
  baseUrl: string,
  action: Action,
  body: Record<string, unknown>,
) => {
  const path = (() => {
    switch (action) {
      case 'summary':
        return '/summary';
      case 'firms':
        return '/firms';
      case 'search':
        return '/search';
      case 'firm':
        return `/firms/${encodeURIComponent(String(body.firmId))}`;
      case 'holdings':
        return `/firms/${encodeURIComponent(String(body.firmId))}/holdings`;
      case 'holders':
        return `/securities/${encodeURIComponent(String(body.securityId))}/holders`;
      case 'company':
        return `/companies/${encodeURIComponent(String(body.companyId))}/summary`;
    }
  })();

  const url = new URL(`${QUERY_ROOT}${path}`, `${baseUrl.replace(/\/$/, '')}/`);
  const keysByAction: Record<Action, Array<Parameters<typeof appendOptional>[2]>> = {
    summary: [],
    firms: ['asOfDate', 'q', 'cursor', 'limit'],
    search: ['q', 'limit'],
    firm: [],
    holdings: ['asOfDate', 'q', 'cursor', 'limit', 'order'],
    holders: ['asOfDate', 'mode', 'cursor', 'limit'],
    company: [],
  };
  for (const key of keysByAction[action]) appendOptional(url.searchParams, body, key);
  return url.toString();
};

const isValidConfiguration = (dependencies: QueryDependencies) => {
  if (
    !UUID_PATTERN.test(dependencies.expectedWorkspaceId ?? '') ||
    !isText(dependencies.readToken, 4096) ||
    !isText(dependencies.apiBaseUrl, 2048)
  ) {
    return false;
  }
  try {
    const url = new URL(dependencies.apiBaseUrl!);
    return (
      url.protocol === 'https:' &&
      dependencies.approvedApiOrigins.includes(url.origin) &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export const handleThirteenFQuery = async (
  payload: unknown,
  context: QueryContext | undefined,
  dependencies: QueryDependencies,
) => {
  const body = readBody(payload);
  const action = body?.action;
  if (
    !isValidConfiguration(dependencies) ||
    context?.workspaceId !== dependencies.expectedWorkspaceId ||
    !body ||
    !isAction(action) ||
    !isValidBody(body, action)
  ) {
    return new Response({ status: 'denied' }, { status: 403 });
  }

  try {
    const upstream = await dependencies.fetcher(
      buildRequestUrl(dependencies.apiBaseUrl!, action, body),
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${dependencies.readToken}` },
      },
    );
    if (!upstream.ok) {
      return new Response(
        { status: 'temporarily_unavailable' },
        { status: 502 },
      );
    }

    const result: unknown = await upstream.json();
    return new Response(result, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response({ status: 'temporarily_unavailable' }, { status: 502 });
  }
};

export const handler = async (
  payload: RoutePayload,
  context?: QueryContext,
) =>
  handleThirteenFQuery(payload, context, {
    apiBaseUrl: process.env.CORGI_THIRTEEN_F_API_BASE_URL?.trim(),
    readToken: process.env.CORGI_THIRTEEN_F_API_READ_TOKEN?.trim(),
    expectedWorkspaceId: process.env.CORGI_THIRTEEN_F_WORKSPACE_ID?.trim(),
    approvedApiOrigins: APPROVED_API_ORIGINS,
    fetcher: fetch,
  });

export default defineLogicFunction({
  universalIdentifier: THIRTEEN_F_QUERY_LOGIC_FUNCTION_ID,
  name: 'thirteen-f-query',
  description:
    'Proxies allowlisted 13F reads for an authenticated Twenty workspace without exposing the website credential.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/thirteen-f/query',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
