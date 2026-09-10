import { describe, expect, it, vi } from 'vitest';

import { reconcileWorkspaceMember } from 'src/modules/wholesaler/onboarding/services/reconcile-workspace-member.service';
import {
  type WholesalerRecord,
  type WholesalerRepository,
} from 'src/modules/wholesaler/onboarding/types';

const TARGET_WORKSPACE_ID = 'corgi-workspace';
const member = {
  id: 'member-1',
  email: '  Damien@Corgi.Com ',
  firstName: ' Damien ',
  lastName: ' Wiese ',
};

const repository = (
  records: WholesalerRecord[] = [],
): WholesalerRepository => ({
  findByWorkspaceMemberId: vi.fn(async (memberId) =>
    records.filter((record) => record.workspaceMemberId === memberId),
  ),
  findByEmail: vi.fn(async (email) =>
    records.filter(
      (record) => record.email?.trim().toLowerCase() === email.toLowerCase(),
    ),
  ),
  listWholesalers: vi.fn(async () => []),
  create: vi.fn(async (id, data) => ({ id, ...data })),
  update: vi.fn(async (id, data) => ({
    ...records.find((record) => record.id === id),
    id,
    ...data,
  })),
  listWorkspaceMembers: vi.fn(),
});

describe('reconcileWorkspaceMember', () => {
  it('creates a normalized wholesaler for a new member', async () => {
    const repo = repository();

    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'created', wholesalerId: member.id });

    expect(repo.create).toHaveBeenCalledWith(member.id, {
      name: 'Damien Wiese',
      email: 'damien@corgi.com',
      wholesalerRole: 'Wholesaler',
      workspaceMemberId: member.id,
    });
  });

  it('links an existing email match, normalizes identity, and defaults a missing role', async () => {
    const repo = repository([
      {
        id: 'wholesaler-1',
        name: 'Damien W.',
        email: 'DAMIEN@CORGI.COM',
        wholesalerRole: null,
        workspaceMemberId: null,
      },
    ]);

    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'updated', wholesalerId: 'wholesaler-1' });

    expect(repo.update).toHaveBeenCalledWith('wholesaler-1', {
      name: 'Damien Wiese',
      email: 'damien@corgi.com',
      wholesalerRole: 'Wholesaler',
      workspaceMemberId: member.id,
    });
  });

  it('is idempotent when the member-created event is retried', async () => {
    const record = {
      id: 'wholesaler-1',
      name: 'Damien Wiese',
      email: 'damien@corgi.com',
      wholesalerRole: 'Wholesaler',
      workspaceMemberId: member.id,
    };
    const repo = repository([record]);

    const input = {
      eventWorkspaceId: TARGET_WORKSPACE_ID,
      targetWorkspaceId: TARGET_WORKSPACE_ID,
      member,
      repository: repo,
    };
    await expect(reconcileWorkspaceMember(input)).resolves.toEqual({
      status: 'unchanged',
      wholesalerId: record.id,
    });
    await expect(reconcileWorkspaceMember(input)).resolves.toEqual({
      status: 'unchanged',
      wholesalerId: record.id,
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('fails closed when multiple wholesalers match', async () => {
    const repo = repository([
      { id: 'one', email: 'damien@corgi.com' },
      { id: 'two', email: 'Damien@Corgi.com' },
    ]);

    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: repo,
      }),
    ).rejects.toMatchObject({
      name: 'WholesalerReconciliationError',
      stage: 'resolve_identity',
      code: 'ambiguous_identity',
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('fails closed when an email match belongs to another member', async () => {
    const repo = repository([
      {
        id: 'one',
        email: 'damien@corgi.com',
        workspaceMemberId: 'someone-else',
      },
    ]);

    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: repo,
      }),
    ).rejects.toMatchObject({
      name: 'WholesalerReconciliationError',
      stage: 'resolve_identity',
      code: 'conflicting_link',
    });
  });

  it('classifies invalid member identity without exposing its values', async () => {
    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member: { ...member, email: '' },
        repository: repository(),
      }),
    ).rejects.toMatchObject({
      name: 'WholesalerReconciliationError',
      stage: 'validate_identity',
      code: 'invalid_identity',
      message: 'Wholesaler reconciliation failed at validate_identity (invalid_identity)',
    });
  });

  it.each([
    [
      'lookup_member_relation',
      'permission_denied',
      () => {
        const repo = repository();
        vi.mocked(repo.findByWorkspaceMemberId).mockRejectedValue({
          errors: [{ extensions: { code: 'FORBIDDEN' } }],
        });
        return repo;
      },
    ],
    [
      'lookup_email',
      'schema_mismatch',
      () => {
        const repo = repository();
        vi.mocked(repo.findByEmail).mockRejectedValue({
          errors: [
            { extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
          ],
        });
        return repo;
      },
    ],
    [
      'create',
      'transport',
      () => {
        const repo = repository();
        vi.mocked(repo.create).mockRejectedValue(new TypeError('fetch failed'));
        return repo;
      },
    ],
    [
      'update',
      'constraint_conflict',
      () => {
        const repo = repository([
          {
            id: 'wholesaler-1',
            name: 'Old name',
            email: 'damien@corgi.com',
            wholesalerRole: 'Wholesaler',
            workspaceMemberId: member.id,
          },
        ]);
        vi.mocked(repo.update).mockRejectedValue(
          new Error('duplicate key violates unique constraint'),
        );
        return repo;
      },
    ],
  ])('classifies %s failures as %s', async (stage, code, buildRepository) => {
    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: TARGET_WORKSPACE_ID,
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: buildRepository(),
      }),
    ).rejects.toMatchObject({
      name: 'WholesalerReconciliationError',
      stage,
      code,
    });
  });

  it('does nothing for another workspace', async () => {
    const repo = repository();

    await expect(
      reconcileWorkspaceMember({
        eventWorkspaceId: 'other-workspace',
        targetWorkspaceId: TARGET_WORKSPACE_ID,
        member,
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'other_workspace' });

    expect(repo.findByEmail).not.toHaveBeenCalled();
    expect(repo.findByWorkspaceMemberId).not.toHaveBeenCalled();
  });

  it('does not misclassify an arbitrary runtime TypeError as a network failure', async () => {
    const repo = repository();
    vi.mocked(repo.findByWorkspaceMemberId).mockRejectedValue(
      new TypeError('Cannot read properties of undefined'),
    );
    await expect(reconcileWorkspaceMember({
      eventWorkspaceId: TARGET_WORKSPACE_ID,
      targetWorkspaceId: TARGET_WORKSPACE_ID,
      member,
      repository: repo,
    })).rejects.toMatchObject({ stage: 'lookup_member_relation', code: 'unexpected' });
  });
});
