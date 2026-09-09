# Corgi CRM app

This internal Twenty app owns Corgi-specific CRM automation. It does not own the
existing `Wholesaler` object, which was created before this app.

## Installation order

1. Apply the workspace configuration that idempotently creates the
   `wholesaler.workspaceMember` relation (`Workspace Member`, `MANY_TO_ONE`).
2. Run the guarded `corgi-crm-app-production.yml` workflow from the exact commit
   deployed to both production services.
3. The manifest defaults `CORGI_CRM_WORKSPACE_ID` to the approved Corgi CRM
   workspace. Do not publish or install this tenant-specific app elsewhere.

The post-install function reconciles all existing WorkspaceMembers. The
`workspaceMember.created` trigger keeps future members synchronized. Both paths
reuse a case-insensitive email match, create a deterministic record ID from the
WorkspaceMember ID when no match exists, and fail closed on ambiguous matches.
They do not allocate leads.

The production workflow verifies the live ECS image digest, authenticated
workspace, required schema, installed version, active database trigger, and
one-to-one member reconciliation. It authenticates with the existing production
smoke-test credentials, creates a uniquely named 30-minute API key for the run,
masks its token, and always attempts verified revocation. No persistent app
deployment credential belongs in the manifest, workflow, or repository.
