import { DEFAULT_WHOLESALER_ROLE } from 'src/constants';
import {
  type WholesalerRecord,
  type WholesalerRepository,
  type WholesalerWrite,
  type WorkspaceMemberIdentity,
} from 'src/modules/wholesaler/onboarding/types';
import {
  normalizeEmail,
  normalizeMemberName,
} from 'src/modules/wholesaler/onboarding/utils/normalize-member-identity';

export type ReconcileWorkspaceMemberResult =
  | { status: 'created' | 'updated' | 'unchanged'; wholesalerId: string }
  | { status: 'skipped'; reason: 'other_workspace' };

const nonEmpty = (value?: string | null): boolean => Boolean(value?.trim());

const uniqueRecords = (records: WholesalerRecord[]): WholesalerRecord[] => [
  ...new Map(records.map((record) => [record.id, record])).values(),
];

export const reconcileWorkspaceMember = async ({
  eventWorkspaceId,
  targetWorkspaceId,
  member,
  repository,
}: {
  eventWorkspaceId: string;
  targetWorkspaceId: string;
  member: WorkspaceMemberIdentity;
  repository: WholesalerRepository;
}): Promise<ReconcileWorkspaceMemberResult> => {
  if (!targetWorkspaceId.trim()) {
    throw new Error('CORGI_CRM_WORKSPACE_ID is required');
  }
  if (eventWorkspaceId !== targetWorkspaceId) {
    return { status: 'skipped', reason: 'other_workspace' };
  }

  const email = normalizeEmail(member.email);
  if (!member.id.trim() || !email) {
    throw new Error('Workspace member requires an id and email');
  }

  const [memberMatches, emailMatches] = await Promise.all([
    repository.findByWorkspaceMemberId(member.id),
    repository.findByEmail(email),
  ]);
  const matches = uniqueRecords([...memberMatches, ...emailMatches]);

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous wholesaler identity for workspace member ${member.id}: ${matches
        .map(({ id }) => id)
        .sort()
        .join(', ')}`,
    );
  }

  const existing = matches[0];
  const name = normalizeMemberName({ ...member, email });
  if (!existing) {
    await repository.create(member.id, {
      name,
      email,
      role: DEFAULT_WHOLESALER_ROLE,
      workspaceMemberId: member.id,
    });
    return { status: 'created', wholesalerId: member.id };
  }

  if (
    nonEmpty(existing.workspaceMemberId) &&
    existing.workspaceMemberId !== member.id
  ) {
    throw new Error(
      `Wholesaler ${existing.id} is already linked to another workspace member`,
    );
  }

  const changes: WholesalerWrite = {};
  if (existing.name?.trim().replace(/\s+/g, ' ') !== name) changes.name = name;
  if (existing.email?.trim() !== email) changes.email = email;
  if (!nonEmpty(existing.role)) changes.role = DEFAULT_WHOLESALER_ROLE;
  if (!nonEmpty(existing.workspaceMemberId)) {
    changes.workspaceMemberId = member.id;
  }

  if (Object.keys(changes).length === 0) {
    return { status: 'unchanged', wholesalerId: existing.id };
  }

  await repository.update(existing.id, changes);
  return { status: 'updated', wholesalerId: existing.id };
};
