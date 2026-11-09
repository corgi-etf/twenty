# Corgi 13F production import

This workflow copies the 25 approved direct files from Tony Aukett's `Sales` folder into the
installed Corgi 13F object. It never moves, edits, or deletes a source file. It does not delete CRM
records or completed CRM files on failure; a rerun converges records that are already complete and
repairs records with a supported upload checkpoint.

## Fixed contract

- Workflow: `.github/workflows/corgi-thirteen-f-import.yml` on `main`, manual dispatch only
- CRM: `https://crm.corgiinvest.com`, workspace `eabf5d9d-fc99-4acb-b160-710ecb1db996`
- Website exchange and OIDC audience:
  `https://admin.corgiinvest.com/api/internal/imports/tony-13f/export`
- Approved manifest SHA-256:
  `1f1adde7fa3f12149d4f51729a6830af52a4e96bd7bd43d2c362c95159298d1c`
- Exact source: 25 files, 20,525,530 bytes, 24 XLSX and one PDF
- Target: 20 derived tickers and five null tickers
- File field universal ID: `ce9040dc-d05b-40b8-8ada-d81e1f30b9af`
- Unique source-node field universal ID: `0f8f0907-75e2-455c-af5c-409e5f11ff46`
- Pending-file checkpoint universal ID: `0540519f-2f64-4429-a72a-9f77e9923f2a`

The GitHub `production` environment currently has no required reviewer. The active safety gate is
therefore the main-only manual dispatch, which requires the exact reviewed main SHA and the
confirmation `IMPORT_TONY_13F_FILES`. Configuring an environment reviewer would add a separate
approval gate but is not assumed by this runbook. The workflow has `contents: read` and
`id-token: write`; checkout does not persist a GitHub credential. No signed URL or token is a
workflow input, output, artifact, or receipt field.

## Credential boundary

The authenticated production browser first proves the exact Corgi ETF workspace and installed app
contract. It creates one deterministic run-owned role and one 30-minute API key. The import role
has exactly:

- the global `UPLOAD_FILE` flag;
- read and update permission for the runtime Corgi 13F object ID; and
- no global record access, settings, tools, delete, destroy, field, row-level, user, or agent
  capabilities.

The key is stored only in a mode `0600` runner-temporary lease. Cleanup looks up a response-lost key
by its exact role, name, and expiry, revokes it, verifies `revokedAt`, and then deletes only the
exact run-owned role. The revoked key row remains as server audit history. The runner removes the
lease, receipt, Twenty CLI config, and Playwright authentication state in an `always()` step.

## Import state machine

The workflow requests GitHub OIDC only after the CRM tenant/app preflight and credential acquisition.
The website accepts the exact repository, owner/repository IDs, main ref, workflow path,
`workflow_dispatch`, production environment, workflow SHA, custom audience, and one-use run marker.
Every returned URL is masked immediately. All 25 files are downloaded into memory with concurrency
four and exact byte-count checks before the first CRM record write.

For each source node:

1. Read by the unique `sourceNodeId`. Create a fileless record if absent; recover a response-lost
   create by rereading the unique node. A different `sourceVersionId` or duplicate node aborts.
2. Preserve manually curated manager/report-period values on reruns while converging source-owned
   metadata.
3. Reserve a FilesField upload, then persist its ID in `importPendingFileId` before any byte PUT.
4. PUT the unchanged bytes, complete the upload, and atomically attach the single file while clearing
   `importPendingFileId`.
5. Reread the record and download its CRM file URL. Require the exact file ID/label, byte length, and
   SHA-256 of the source bytes.

An attached matching record is retained and verified. A completed checkpoint is attached without a
new upload. Replacement occurs only when the API explicitly reports the checkpoint as still pending
or missing. Generic/transient attachment errors receive three bounded attempts, then fail while
retaining the checkpoint for a rerun.

## Failure and recovery

Rerun the same manual workflow after correcting a transient failure. Successful records remain
attached and are verified; they are never rolled back. A failed record remains fileless with a
checkpoint or retains its valid attached file.

Twenty's pending-file reaper processes only `PENDING` uploads older than 24 hours on an hourly cron,
in batches of 200. The nominal cleanup window is therefore 24–25 hours and can be longer under
backlog or storage errors. A failed storage cleanup may leave inaccessible bytes but not a valid
record reference. `UPLOADED` temporary files are not reaped; the importer therefore retries their
checkpointed attachment and never replaces a generic/ambiguous failure.

Do not add a broad delete mutation or global rollback. If cleanup cannot revoke the exact key or
prove role ownership, retain the lease from the failed runner logs' run identity, revoke the key and
delete the exact role through an approved maintenance run, and verify the role has no remaining API
keys before removal.

## Verification receipt

Success requires 25 unique source node/version pairs, one byte-verified file each, and `verified: 25`.
The step summary contains only counts, the approved manifest digest, and an aggregate content digest.
It contains no filenames, source IDs, file IDs, credentials, OIDC tokens, or signed URLs. No artifact
is uploaded.
