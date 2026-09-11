export type WorkspaceMemberIdentity = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type WholesalerRecord = {
  id: string;
  name?: string | null;
  email?: string | null;
  wholesalerRole?: string | null;
  workspaceMemberId?: string | null;
};

export type WholesalerWrite = {
  name?: string;
  email?: string;
  wholesalerRole?: string;
  workspaceMemberId?: string;
};

export type WorkspaceMemberPage = {
  members: WorkspaceMemberIdentity[];
  nextCursor?: string;
};

// A capability, not part of WholesalerRepository: the outreach report depends
// only on this, and nothing that reads roles for the report may oblige an
// onboarding test double to grow a method it never calls.
export type WholesalerRoleReader = {
  // Optional so a caller with only the by-ids lookup still type-checks; the
  // report prefers this and degrades to the narrower read when it is absent.
  listAllRoles?: () => Promise<WholesalerRecord[]>;
  findRolesByIds(wholesalerIds: string[]): Promise<WholesalerRecord[]>;
};

export type WholesalerRepository = {
  findByWorkspaceMemberId(memberId: string): Promise<WholesalerRecord[]>;
  findByEmail(email: string): Promise<WholesalerRecord[]>;
  create(
    id: string,
    data: Required<WholesalerWrite>,
  ): Promise<WholesalerRecord>;
  update(id: string, data: WholesalerWrite): Promise<WholesalerRecord>;
  listWorkspaceMembers(cursor?: string): Promise<WorkspaceMemberPage>;
};
