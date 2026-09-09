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

const repository = (records: WholesalerRecord[] = []): WholesalerRepository => ({
  findByWorkspaceMemberId: vi.fn(async (memberId) =>
    records.filter((record) => record.workspaceMemberId === memberId),
  ),
  findByEmail: vi.fn(async (email) =>
    records.filter(
      (record) => record.email?.trim().toLowerCase() === email.toLowerCase(),
    ),
  ),
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
      role: 'Wholesaler',
      workspaceMemberId: member.id,
    });
  });

  it('links an existing email match, normalizes identity, and defaults a missing role', async () => {
    const repo = repository([
      {
        id: 'wholesaler-1',
        name: 'Damien W.',
        email: 'DAMIEN@CORGI.COM',
        role: null,
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
      role: 'Wholesaler',
      workspaceMemberId: member.id,
    });
  });

  it('is idempotent when the member-created event is retried', async () => {
    const record = {
      id: 'wholesaler-1',
      name: 'Damien Wiese',
      email: 'damien@corgi.com',
      role: 'Wholesaler',
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
    ).rejects.toThrow('Ambiguous wholesaler identity');
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
    ).rejects.toThrow('already linked to another workspace member');
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
});
