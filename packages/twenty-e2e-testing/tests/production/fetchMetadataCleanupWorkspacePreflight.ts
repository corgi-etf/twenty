export type FetchMetadataCleanupWorkspaceResponse = {
  data?: {
    currentWorkspace?: {
      id?: string;
      customDomain?: string | null;
      isCustomDomainEnabled?: boolean;
    };
  };
  errors?: unknown;
};

export const assertFetchMetadataCleanupWorkspace = ({
  body,
  expectedWorkspaceId,
  expectedHostname,
}: {
  body: FetchMetadataCleanupWorkspaceResponse;
  expectedWorkspaceId: string;
  expectedHostname: string;
}): void => {
  const workspace = body.data?.currentWorkspace;

  if (body.errors !== undefined) {
    throw new Error('Fetch metadata cleanup workspace response has errors');
  }
  if (workspace?.id !== expectedWorkspaceId) {
    throw new Error('Fetch metadata cleanup workspace is not approved');
  }
  if (workspace.customDomain !== expectedHostname) {
    throw new Error('Fetch metadata cleanup custom domain is not approved');
  }
};
