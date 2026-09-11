import { describe, expect, it, vi } from 'vitest';

import { handleLogOutreachFromCompany } from 'src/modules/outreach/log-outreach-from-company.logic-function';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const WORKSPACE_ID = uuid('1');
const MEMBER_ID = uuid('2');
const WHOLESALER_ID = uuid('3');
const COMPANY_ID = uuid('4');
const ACTIVITY_ID = uuid('5');

const body = {
  activityId: ACTIVITY_ID,
  companyId: COMPANY_ID,
  activityType: 'PHONE_CALL',
  outcome: 'connected',
};
const context = { workspaceId: WORKSPACE_ID, workspaceMemberId: MEMBER_ID };

const deps = (overrides: Record<string, unknown> = {}) => ({
  expectedWorkspaceId: WORKSPACE_ID,
  now: () => new Date('2026-09-10T16:30:00.000Z'),
  createOutreachRepository: () => ({
    createActivity: vi.fn().mockResolvedValue({ id: ACTIVITY_ID }),
  }),
  createWholesalerRepository: () => ({
    findByWorkspaceMemberId: vi
      .fn()
      .mockResolvedValue([{ id: WHOLESALER_ID, workspaceMemberId: MEMBER_ID }]),
  }),
  ...overrides,
}) as never;

describe('handleLogOutreachFromCompany', () => {
  it('logs the activity for the authenticated caller', async () => {
    const response = await handleLogOutreachFromCompany(
      { body },
      context as never,
      deps(),
    );
    expect(response).toMatchObject({ status: 201 });
  });

  it.each([
    ['a foreign workspace', { workspaceId: uuid('9'), workspaceMemberId: MEMBER_ID }],
    ['no workspace member', { workspaceId: WORKSPACE_ID }],
  ])('denies %s', async (_n, ctx) => {
    const repo = { createActivity: vi.fn() };
    const response = await handleLogOutreachFromCompany({ body }, ctx as never, deps({
      createOutreachRepository: () => repo,
    }));
    expect(response).toMatchObject({ status: 403 });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it('denies a body carrying an unexpected key rather than ignoring it', async () => {
    const response = await handleLogOutreachFromCompany(
      { body: { ...body, wholesalerId: uuid('8') } },
      context as never,
      deps(),
    );
    expect(response).toMatchObject({ status: 403 });
  });

  it.each([
    ['an unresolved caller', []],
    ['an ambiguously linked caller', [
      { id: WHOLESALER_ID, workspaceMemberId: MEMBER_ID },
      { id: uuid('7'), workspaceMemberId: MEMBER_ID },
    ]],
  ])('fails closed for %s instead of writing an unowned activity', async (_n, rows) => {
    const repo = { createActivity: vi.fn() };
    const response = await handleLogOutreachFromCompany({ body }, context as never, deps({
      createOutreachRepository: () => repo,
      createWholesalerRepository: () => ({
        findByWorkspaceMemberId: vi.fn().mockResolvedValue(rows),
      }),
    }));
    expect(response).toMatchObject({ status: 409 });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it('rejects an unsupported taxonomy value without leaking it back', async () => {
    const response = await handleLogOutreachFromCompany(
      { body: { ...body, activityType: 'cold_call' } },
      context as never,
      deps(),
    );
    expect(response).toMatchObject({ status: 400 });
    expect(JSON.stringify(response)).not.toContain('cold_call');
  });
});
