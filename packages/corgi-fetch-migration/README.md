# Corgi Fetch → Twenty migration

This private Nx tool migrates the legacy Fetch CRM into Twenty without writing
directly to Twenty's database. Source reads run in a PostgreSQL `REPEATABLE READ,
READ ONLY` transaction. Destination schema and records use Twenty's metadata and
core REST APIs.

The safe default is `plan`: it reads and transforms data, prints aggregate counts,
and performs no writes. Plans and rollback manifests contain CRM data and must be
stored at an absolute path outside the Git worktree. Files are created with mode
`0600`; apply atomically checkpoints and resumes its manifest at the requested
path.

## Data mapping

- `companies` → standard Company, including the standard address latitude and
  longitude, tags, source ownership, status, and provenance.
- `contacts` → standard Person with Company relation. Duplicate emails are all
  preserved in `legacyEmail`; the primary/richest/stably ordered contact alone owns
  the unique standard email.
- `app_user_roles` → Wholesaler; the allowlisted `neon_auth.user` projection is
  used only to prepare active-user invitations. Password, account, and session
  tables are never read. No WorkspaceMember is API-created.
- teams and memberships → SalesTeam and TeamMembership when those optional source
  tables exist.
- daily assignments → LeadAssignment; activities → OutreachActivity; follow-ups →
  standard Task and TaskTarget.
- company sources → SourceRecord; holdings → HoldingObservation.
- import batches and all accepted or pending review rows → ImportBatch and
  ImportReviewItem. Pending review rows remain quarantined and are never promoted
  to Companies.
- duplicate activity archive → ArchivedOutreachActivity linked to its canonical
  activity when that record exists.

Every migrated record has a fixed-namespace UUIDv5 identity, unique
`legacyFetchId`, `migrationRunId`, and HMAC of its source row. Duplicate company
names are intentionally preserved. Domain, email, tag-option, deterministic-ID,
and destination external-key collisions have explicit deterministic behavior or
fail before the first write.

## Required environment

Provide credentials through environment variables or a secrets manager-backed
shell session; never place them in a file in this repository.

```text
FETCH_DATABASE_URL        legacy PostgreSQL connection string (plan only)
FETCH_MIGRATION_HMAC_KEY  random value of at least 32 characters (plan only)
TWENTY_BASE_URL           for example, https://crm.corgiinvest.com
TWENTY_API_KEY            Twenty Admin API key (bootstrap/apply/verify/rollback)
```

Keep the same HMAC key for every plan of this source. Changing it intentionally
marks every source row as changed.

Every record HMAC also includes the global transform-contract version. Bump that
version whenever a schema mapping, normalization rule, or output payload changes;
otherwise an unchanged source row could incorrectly skip the new transform.

## Runbook

Choose an encrypted state directory outside the checkout and take a destination
recovery point before bootstrap/apply.

```bash
export CORGI_MIGRATION_STATE_DIR=/absolute/private/encrypted/path
chmod 700 "$CORGI_MIGRATION_STATE_DIR"

yarn nx run corgi-fetch-migration:plan \
  --args="--run-id fetch-cutover-20260907 --out $CORGI_MIGRATION_STATE_DIR/plan.json"

yarn nx run corgi-fetch-migration:schema:bootstrap \
  --args="--plan $CORGI_MIGRATION_STATE_DIR/plan.json --confirm BOOTSTRAP_FETCH_SCHEMA"

yarn nx run corgi-fetch-migration:apply \
  --args="--plan $CORGI_MIGRATION_STATE_DIR/plan.json --manifest-out $CORGI_MIGRATION_STATE_DIR/rollback.json --confirm APPLY_FETCH_MIGRATION"

yarn nx run corgi-fetch-migration:verify \
  --args="--plan $CORGI_MIGRATION_STATE_DIR/plan.json --manifest $CORGI_MIGRATION_STATE_DIR/rollback.json"
```

The apply command never bootstraps schema implicitly. This keeps both mutations
separately reviewable. It preflights the entire destination for collisions, sends
at most two concurrent batches of at most 100 records and 8 MiB of final UTF-8
JSON, retries only timeouts, HTTP 429, and HTTP 5xx responses, and captures
server-normalized hashes in the rollback manifest. A single record above the safe
body limit fails before any destination request and is never truncated. Before its
first destination write, apply durably checkpoints every mutation and update
before-image. If interrupted, rerun the same plan and manifest path; rows already
owned by the same migration run are reconstructed into the final rollback manifest
instead of disappearing when their upsert is skipped. An incomplete checkpoint
cannot be used for rollback.

Rollback first verifies the manifest hash, record ownership, source HMAC, and all
guarded field values. If any migrated record was edited after cutover, rollback
stops before changing any record. Created rows are soft-deleted; updated rows are
restored from the manifest.

```bash
yarn nx run corgi-fetch-migration:rollback \
  --args="--manifest $CORGI_MIGRATION_STATE_DIR/rollback.json --confirm ROLLBACK_FETCH_MIGRATION"
```

## Reconciliation baseline

For the inspected Fetch snapshot, a complete plan should account for:

| Source | Expected | Twenty result |
| --- | ---: | --- |
| companies / geocoded locations | 2,185 / 2,185 | 2,185 Companies |
| contacts | 1,955 | 1,955 People |
| app user roles / allowlisted auth users | 10 / 9 | 10 Wholesalers + active invitation plan |
| daily assignments | 4,046 | 4,046 LeadAssignments |
| activities | 986 | 986 OutreachActivities |
| follow-ups | 159 | 159 Tasks + 159 TaskTargets |
| company sources | 2,603 | 2,603 SourceRecords |
| holding observations | 331 | 331 HoldingObservations |
| tags / company tags | 16 / 1,761 | Company multi-select values/links |
| import batches | 14 | 14 ImportBatches |
| import review items | 212 | 212 ImportReviewItems; pending rows stay quarantined |
| archived duplicate activities | 5 | 5 ArchivedOutreachActivities |

With no optional team tables, the baseline is 12,665 record upserts. The plan
summary, apply mutation count, and verify count must reconcile to the frozen plan;
source table counts should be rechecked immediately before cutover.

## Verification

```bash
yarn nx run corgi-fetch-migration:test
yarn nx run corgi-fetch-migration:typecheck
yarn nx run corgi-fetch-migration:lint
```

Live UI verification is a separate production Playwright suite. Run it after the
API verification succeeds so login, Company records, Wholesaler ownership, and
the map page are checked through the deployed application.
