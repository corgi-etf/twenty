import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLifecycleEvent } from './lifecycle-event.handler';
import { reconcileLifecycle } from './services/reconcile-lifecycle.service';
import type * as LifecycleService from './services/reconcile-lifecycle.service';
vi.mock('./services/reconcile-lifecycle.service', async (importOriginal) => ({
  ...(await importOriginal<typeof LifecycleService>()),
  reconcileLifecycle: vi.fn().mockResolvedValue({ status: 'recorded' }),
}));
const source = {
  id: 'allocation',
  companyId: 'company',
  ticker: 'ACME',
  amount: { amountMicros: '1000000', currencyCode: 'USD' },
  updatedAt: '2026-10-05T12:00:00Z',
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe('lifecycle event evidence', () => {
  it('ignores validation-only and provenance-only updates before reading source', async () => {
    vi.stubEnv('CORGI_CRM_WORKSPACE_ID', 'workspace');
    const result = await handleLifecycleEvent('companyAllocation', {
      workspaceId: 'workspace',
      properties: {
        before: source,
        after: {
          ...source,
          loggedAt: source.updatedAt,
          updatedAt: '2026-10-05T12:00:01Z',
        },
      },
    });
    expect(result).toEqual({ status: 'skipped', reason: 'no_input_change' });
    expect(reconcileLifecycle).not.toHaveBeenCalled();
  });
  it('preserves the triggering source facts and event actor instead of looking up the newest editor', async () => {
    vi.stubEnv('CORGI_CRM_WORKSPACE_ID', 'workspace');
    await handleLifecycleEvent('companyAllocation', {
      workspaceId: 'workspace',
      workspaceMemberId: 'event-actor',
      properties: {
        before: { ...source, ticker: '' },
        after: {
          ...source,
          updatedBy: { workspaceMemberId: 'snapshot-actor' },
        },
      },
    });
    expect(reconcileLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSnapshot: {
          ...source,
          updatedBy: { workspaceMemberId: 'snapshot-actor' },
        },
        eventAt: source.updatedAt,
        actorWorkspaceMemberId: 'event-actor',
      }),
    );
  });
});
