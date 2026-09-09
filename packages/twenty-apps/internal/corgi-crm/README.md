# Corgi CRM app

This internal Twenty app owns Corgi-specific CRM automation. It does not own the
existing `Wholesaler` object, which was created before this app.

## Installation order

1. Apply the workspace configuration that idempotently creates the
   `wholesaler.workspaceMember` relation (`Workspace Member`, `MANY_TO_ONE`).
2. Install or update this app only in the Corgi CRM workspace.
3. Set `CORGI_CRM_WORKSPACE_ID` to that workspace's ID before the synchronous
   post-install reconciliation runs.

The post-install function reconciles all existing WorkspaceMembers. The
`workspaceMember.created` trigger keeps future members synchronized. Both paths
reuse a case-insensitive email match, create a deterministic record ID from the
WorkspaceMember ID when no match exists, and fail closed on ambiguous matches.
They do not allocate leads.
