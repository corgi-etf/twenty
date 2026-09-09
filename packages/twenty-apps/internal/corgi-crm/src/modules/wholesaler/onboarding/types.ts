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
