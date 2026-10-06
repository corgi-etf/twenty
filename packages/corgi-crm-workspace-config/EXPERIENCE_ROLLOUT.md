# CRM experience rollout tools

These Node 24 commands are separate from historical cleanup and territory workflows. Preview is the default. Neither command runs production writes without `--apply`, a previously written manifest, its explicitly reviewed SHA-256 digest, and a journal path. They verify the effective authenticated workspace is the active **Corgi ETF** tenant with metadata permission, using the existing tenant preflight. Set `CORGI_CRM_ACCESS_TOKEN` to an authenticated administrator session token through the established secret channel (for example the approved E2E login flow), and set `RUNNER_TEMP` to a private existing directory. An ordinary workspace API key cannot resolve the required `currentUser`/membership preflight. `CORGI_CRM_API_KEY` is only a compatibility environment-variable alias for a session token, not an API-key bypass. Do not put credentials in shell arguments. `CORGI_CRM_API_URL`, if set, must be `https://crm.corgiinvest.com`.

All manifests/journals must be beneath `RUNNER_TEMP`, may not be symlinks, and are created with mode 0600. A preview refuses to overwrite an existing artifact. Review the manifest itself as well as the printed counts and digest. Keep these artifacts through operational signoff; they are not source files and must not be committed.

## Experience configuration

From the repository root:

```sh
node packages/corgi-crm-workspace-config/src/experience-config-cli.ts \
  --manifest "$RUNNER_TEMP/experience-metadata-preview.json"
```

After reviewing its complete `operations` array, apply that exact manifest:

```sh
node packages/corgi-crm-workspace-config/src/experience-config-cli.ts \
  --apply --manifest "$RUNNER_TEMP/experience-metadata-preview.json" \
  --reviewed-digest '<printed SHA-256>' \
  --journal "$RUNNER_TEMP/experience-metadata-journal.jsonl"
```

The allowlist covers company/person `activeClient`, member `accentPalette`, activity-type metadata labels/bootstrap, full-page object defaults, the simplified company/person fields, activity-type-first columns, Follow-ups view, and sales navigation. Existing activity SELECT options are preserved. It does not call company or wholesaler data mutations, change territory assignments/projections, invoke cleanup, or alter company view sorting. Personal views/navigation and native Notes views/content/targets are preserved; the workspace Notes object navigation entry is hidden.

Metadata creation and layout are separate reviewed stages because new fields receive server IDs. If output says `requiresNewReviewedPreview: true`, generate a **new** preview with a new artifact name, review its digest, and apply with a new journal. Completion is `remainingOperations: 0`. The entire metadata/view/navigation snapshot must match the reviewed preview before any mutation. Each operation is journaled before and after. On interruption, do not replay an old journal: inspect it, then generate a fresh convergent preview. An unfinished `.lock` also requires checking that no previous command is still running before removing it.

## Company ownership backfill

The app's `companyOwnership` object and its unique company/wholesaler pair must already be installed. Obtain the exact active company count from the independently reviewed workspace inventory.

```sh
node packages/corgi-crm-workspace-config/src/company-ownership-cli.ts \
  --manifest "$RUNNER_TEMP/ownership-preview.json" \
  --expected-company-count '<exact count>'
```

The scan exhausts all company/wholesaler/junction pages, checks distinct rows, cursors and total counts, and includes soft-deleted junctions. A tombstoned pair is never recreated: deliberate owner removal remains authoritative. Account owners map only by immutable wholesaler `workspaceMemberId`; historical owners map by wholesaler ID. Equal legacy links deduplicate. An existing active primary is preserved; otherwise mapped account owner is the primary, falling back to historical owner. Different valid legacy owners are informational: both are preserved, with the mapped account owner primary. Unmapped/ambiguous identities and multiple active primaries have `severity: blocking` in `preview.review`; **any blocking entry prevents all application**. Resolve the source ambiguity through the approved operational review and produce a new preview; do not hand-edit the generated additions.

```sh
node packages/corgi-crm-workspace-config/src/company-ownership-cli.ts \
  --apply --manifest "$RUNNER_TEMP/ownership-preview.json" \
  --reviewed-digest '<printed SHA-256>' \
  --journal "$RUNNER_TEMP/ownership-journal.jsonl"
```

This uses **guarded pre/post comparisons, not atomic compare-and-set**. The full source inventory is revalidated initially. Immediately around every insertion it rechecks the company's revision and both legacy source owner fields, authoritative wholesaler mappings, and all company junctions including tombstones. Each pair has the same deterministic UUID used by the UI. The journal is fsynced before insertion, after a returned successful insertion, and after verification. Confirmed insertions can resume with the same manifest/journal without duplication. A lost response, incomplete journal, unexplained state change, or ambiguous post-check stops the command for manual review. It never deletes or rolls back rows, never changes legacy owner fields, and never assigns ownership by name. Inspect the deterministic ownership ID and journal before preparing a fresh reviewed preview after an uncertain write.

Run local verification without credentials:

```sh
node --test packages/corgi-crm-workspace-config/test/*.test.ts
node packages/corgi-crm-workspace-config/src/experience-config-cli.ts --help
node packages/corgi-crm-workspace-config/src/company-ownership-cli.ts --help
```

## Reviewed evidence storage in CI

`crm-experience-rollout.yml` keeps every manifest and journal out of GitHub. This
repository is a public fork of `twentyhq/twenty`, so a run artifact describing
production records would be downloadable by anyone; the workflow therefore refuses
to start unless its evidence destination is the private, lifecycle-bound bucket
`corgi-crm-production-maintenance-<account>-<region>`, and it uses no
upload-artifact or download-artifact step at all.

A preview writes its reviewed manifest to, and an apply reads exactly that object
from:

```
s3://corgi-crm-production-maintenance-<account>-<region>/crm-experience/previews/<dataset>/<run id>/<attempt>/manifest.json
```

An apply preserves its journal and result, even when it fails, under:

```
s3://corgi-crm-production-maintenance-<account>-<region>/crm-experience/applies/<dataset>/<run id>/<attempt>/
```

Run-level provenance is still proved through the GitHub API (`workflow_dispatch`,
`success`, `main`, matching `head_sha`, matching attempt, and this workflow path),
so selecting a preview remains bound to one reviewed run. A preview refuses to
overwrite an existing object, and the deployment role is granted `GetObject` and
`PutObject` only — never `DeleteObject` — so the audit trail is append-only.
Objects expire after 30 days through the bucket lifecycle rule, which replaces the
previous 7-day artifact retention; keep anything needed beyond that out of band.
Because the ownership apply can outlast one role session, the workflow re-assumes
the role before writing evidence.
