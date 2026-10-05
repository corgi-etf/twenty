# CRM experience rollout tools

These Node 24 commands are separate from historical cleanup and territory workflows. Preview is the default. Neither command runs production writes without `--apply`, a previously written manifest, its explicitly reviewed SHA-256 digest, and a journal path. They verify the effective authenticated workspace is the active **Corgi ETF** tenant with metadata permission, using the existing tenant preflight. Set `CORGI_CRM_API_KEY` to the authorized bearer credential through the established secret channel, and set `RUNNER_TEMP` to a private existing directory. Do not put credentials in shell arguments. `CORGI_CRM_API_URL`, if set, must be `https://crm.corgiinvest.com`.

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

The scan exhausts all company/wholesaler/junction pages, checks distinct rows, cursors and total counts, and includes soft-deleted junctions. A tombstoned pair is never recreated: deliberate owner removal remains authoritative. Account owners map only by immutable wholesaler `workspaceMemberId`; historical owners map by wholesaler ID. Equal legacy links deduplicate. An existing active primary is preserved; otherwise mapped account owner is the primary, falling back to historical owner. Unmapped/ambiguous identities, different legacy owners, and multiple primaries appear in `preview.review`; **any unresolved review entry blocks all application**. Resolve the source ambiguity through the approved operational review and produce a new preview; do not hand-edit the generated additions.

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
