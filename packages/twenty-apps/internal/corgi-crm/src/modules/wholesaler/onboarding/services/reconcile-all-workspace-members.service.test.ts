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
          memberId: 'member-2',
          message:
            'Ambiguous wholesaler identity for workspace member member-2: duplicate-1, duplicate-2',
        },
      ],
    });
    expect(repository.listWorkspaceMembers).toHaveBeenNthCalledWith(1, undefined);
    expect(repository.listWorkspaceMembers).toHaveBeenNthCalledWith(2, 'next');
  });
});
