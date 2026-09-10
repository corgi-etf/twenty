import { describe, expect, it, vi } from 'vitest';

import { reconcileAllWorkspaceMembers } from 'src/modules/wholesaler/onboarding/services/reconcile-all-workspace-members.service';
import { type WholesalerRepository } from 'src/modules/wholesaler/onboarding/types';

describe('reconcileAllWorkspaceMembers', () => {
  it('backfills every page and reports safe ambiguity failures', async () => {
    const repository: WholesalerRepository = {
      listWorkspaceMembers: vi
        .fn()
        .mockResolvedValueOnce({
          members: [
            { id: 'member-1', email: 'one@corgi.com' },
            { id: 'member-2', email: 'duplicate@corgi.com' },
          ],
          nextCursor: 'next',
        })
        .mockResolvedValueOnce({
          members: [{ id: 'member-3', email: 'three@corgi.com' }],
        }),
      findByWorkspaceMemberId: vi.fn(async () => []),
      findByEmail: vi.fn(async (email) =>
        email === 'duplicate@corgi.com'
          ? [
              { id: 'duplicate-1', email },
              { id: 'duplicate-2', email },
            ]
          : [],
      ),
      listWholesalers: vi.fn(async () => []),
      create: vi.fn(async (id, data) => ({ id, ...data })),
      update: vi.fn(),
    };

    await expect(
      reconcileAllWorkspaceMembers({
        workspaceId: 'corgi-workspace',
        repository,
      }),
    ).resolves.toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      failures: [
        {
          stage: 'resolve_identity',
          code: 'ambiguous_identity',
        },
      ],
    });
    expect(repository.listWorkspaceMembers).toHaveBeenNthCalledWith(1, undefined);
    expect(repository.listWorkspaceMembers).toHaveBeenNthCalledWith(2, 'next');
  });

  it('reduces unknown thrown values to a safe unexpected diagnostic', async () => {
    const repository: WholesalerRepository = {
      listWorkspaceMembers: vi.fn().mockResolvedValue({
        members: [{ id: 'private-member-id', email: 'private@example.com' }],
      }),
      findByWorkspaceMemberId: vi.fn().mockRejectedValue({
        secret: 'provider detail',
      }),
      findByEmail: vi.fn().mockResolvedValue([]),
      listWholesalers: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      reconcileAllWorkspaceMembers({
        workspaceId: 'corgi-workspace',
        repository,
      }),
    ).resolves.toMatchObject({
      failures: [
        { stage: 'lookup_member_relation', code: 'unexpected' },
      ],
    });
  });
});
