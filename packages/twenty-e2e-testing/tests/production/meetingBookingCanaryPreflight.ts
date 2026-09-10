const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MEETING_CANARY_ACTOR_IDENTITY_QUERY = `
  query ReadMeetingCanaryActorIdentity {
    currentUser {
      id
      currentWorkspace { id }
      currentUserWorkspace { id userId deletedAt isImpersonating }
      workspaceMember { id userWorkspaceId }
    }
  }
`;

export const MEETING_CANARY_MEMBERS_QUERY = `
  query FindMeetingCanaryActor {
    workspaceMembers(first: 100) {
      edges { node { id userId timeZone } }
    }
  }
`;

const requireRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Meeting canary identity response is malformed');
  }
  return value as Record<string, unknown>;
};

const requireUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Meeting canary identity identifier is invalid');
  }
  return value;
};

export const resolveMeetingCanaryActor = ({
  identity,
  members,
  expectedWorkspaceId,
  expectedUserWorkspaceId,
}: {
  identity: unknown;
  members: unknown;
  expectedWorkspaceId: string;
  expectedUserWorkspaceId: string;
}) => {
  const user = requireRecord(requireRecord(identity).currentUser);
  const workspace = requireRecord(user.currentWorkspace);
  const membership = requireRecord(user.currentUserWorkspace);
  const authenticatedMember = requireRecord(user.workspaceMember);
  const userId = requireUuid(user.id);
  const workspaceMemberId = requireUuid(authenticatedMember.id);

  if (
    requireUuid(workspace.id) !== requireUuid(expectedWorkspaceId) ||
    requireUuid(membership.id) !== requireUuid(expectedUserWorkspaceId) ||
    membership.userId !== userId ||
    authenticatedMember.userWorkspaceId !== membership.id ||
    membership.deletedAt !== null ||
    (membership.isImpersonating !== false &&
      membership.isImpersonating !== null)
  ) {
    throw new Error('Meeting canary authenticated identity does not match');
  }

  const edges = requireRecord(requireRecord(members).workspaceMembers).edges;
  if (!Array.isArray(edges)) {
    throw new Error('Meeting canary workspace members response is malformed');
  }
  const workspaceMembers = edges.map((edge: unknown) => {
    const member = requireRecord(requireRecord(edge).node);
    const id = requireUuid(member.id);
    const memberUserId =
      member.userId === null ? null : requireUuid(member.userId);
    if (member.timeZone !== null && typeof member.timeZone !== 'string') {
      throw new Error('Meeting canary member time zone is malformed');
    }
    return { id, userId: memberUserId, timeZone: member.timeZone };
  });
  const actors = workspaceMembers.filter((member) => member.userId === userId);
  if (actors.length !== 1 || actors[0]?.id !== workspaceMemberId) {
    throw new Error(
      'Meeting canary actor does not match the authenticated member',
    );
  }
  const timeZone =
    actors[0].timeZone === 'system' ? 'UTC' : (actors[0].timeZone ?? 'UTC');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('Meeting canary member time zone is invalid');
  }
  return { workspaceMemberId, workspaceMembers, timeZone };
};
