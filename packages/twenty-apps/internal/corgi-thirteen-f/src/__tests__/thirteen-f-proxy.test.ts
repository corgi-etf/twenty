import { describe, expect, it, vi } from 'vitest';

import { handleThirteenFQuery } from 'src/logic-functions/thirteen-f-query.logic-function';

const workspaceId = '2d13f1ea-69ca-4e45-b69f-442d3dc600f0';
const context = { workspaceId };

describe('13F server proxy', () => {
  it('maps an allowlisted holdings query and keeps its bearer token upstream', async () => {
    const fetcher = vi.fn(async () =>
      new globalThis.Response(
        JSON.stringify({ items: [], totalCount: 0, pageInfo: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await handleThirteenFQuery(
      {
        action: 'holdings',
        firmId: '71337d42-47fe-448d-a7dd-315a8385eabe',
        asOfDate: '2026-09-30',
        q: 'NVDA',
        order: 'value_desc',
        limit: 50,
      },
      context,
      {
        apiBaseUrl: 'https://example.test',
        readToken: 'server-only-token',
        expectedWorkspaceId: workspaceId,
        approvedApiOrigins: ['https://example.test'],
        fetcher,
      },
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/internal/thirteen-f/firms/71337d42-47fe-448d-a7dd-315a8385eabe/holdings?asOfDate=2026-09-30&q=NVDA&limit=50&order=value_desc',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: 'Bearer server-only-token' },
      }),
    );
  });

  it.each([
    ['wrong workspace', { workspaceId: crypto.randomUUID() }, { action: 'summary' }],
    ['unknown action', context, { action: 'files' }],
    [
      'unknown key',
      context,
      { action: 'summary', apiKey: 'do-not-forward-client-secrets' },
    ],
  ])('denies %s without contacting the website', async (_name, caller, body) => {
    const fetcher = vi.fn();

    const response = await handleThirteenFQuery(body, caller, {
      apiBaseUrl: 'https://example.test',
      readToken: 'server-only-token',
      expectedWorkspaceId: workspaceId,
      approvedApiOrigins: ['https://example.test'],
      fetcher,
    });

    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a generic failure instead of an upstream body or credential', async () => {
    const fetcher = vi.fn(async () =>
      new globalThis.Response('private database detail', { status: 503 }),
    );

    const response = await handleThirteenFQuery(
      { action: 'summary' },
      context,
      {
        apiBaseUrl: 'https://example.test',
        readToken: 'server-only-token',
        expectedWorkspaceId: workspaceId,
        approvedApiOrigins: ['https://example.test'],
        fetcher,
      },
    );

    expect(response.status).toBe(502);
    const responseBody = JSON.stringify(response.body);
    expect(responseBody).toContain('temporarily_unavailable');
    expect(responseBody).not.toContain('private database detail');
    expect(responseBody).not.toContain('server-only-token');
  });

  it('denies an arbitrary HTTPS origin before sending the bearer token', async () => {
    const fetcher = vi.fn();

    const response = await handleThirteenFQuery(
      { action: 'summary' },
      context,
      {
        apiBaseUrl: 'https://attacker.example',
        readToken: 'server-only-token',
        expectedWorkspaceId: workspaceId,
        approvedApiOrigins: ['https://admin.corgiinvest.com'],
        fetcher,
      },
    );

    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
