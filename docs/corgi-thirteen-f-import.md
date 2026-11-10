# Corgi 13F canonical ingestion

The production migration reads the 28,320 holdings already normalized in the CRM and publishes
typed 13F records to the canonical backend. It does not read, copy, persist, attach, or serve an
original spreadsheet. The CRM is a one-time legacy source for this migration, not the 13F system of
record.

## Production boundary

- Workflow: `.github/workflows/corgi-thirteen-f-import.yml` on `main`, manual dispatch only
- Confirmation: `MIGRATE_NORMALIZED_13F`
- CRM: `https://crm.corgiinvest.com`, Corgi ETF workspace
- Canonical backend: `https://admin.corgiinvest.com`
- OIDC audience: `https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions`
- Expected source inventory: exactly 28,320 normalized CRM holding rows
- Source classification: `LEGACY_NORMALIZED`
- Coverage classification: `PARTIAL`

The job runs in the GitHub `production` environment on a GitHub-hosted runner. It validates the
repository name, repository ID, owner ID, main ref, manual event, reviewed release SHA, and runner
environment before the migration begins. GitHub permissions are limited to `contents: read` and
`id-token: write`; checkout does not persist a GitHub credential.

The backend pins the issuer and these claims:

- repository `Corgi-ETF/twenty`
- repository ID `1359532075`
- owner ID `241377158`
- ref `refs/heads/main`
- workflow
  `corgi-etf/twenty/.github/workflows/corgi-thirteen-f-import.yml@refs/heads/main`
- event `workflow_dispatch`
- environment `production`

No static backend write secret is used.

## CRM credential boundary

The authenticated production browser creates a deterministic run-owned role and a 30-minute API
key. The role can read only the installed 13F manager, security, and holding objects. It cannot
update any object and has no global permission flags, global record access, settings, tools, delete,
destroy, field, row-level, user, or agent capability.

The key exists only in a mode `0600` runner-temporary lease. Cleanup can recover a response-lost key
by exact role, key name, and expiry. It revokes the key, verifies `revokedAt`, proves ownership of the
exact role, and deletes only that role. The workflow removes the lease, aggregate receipt, local
Twenty configuration, and Playwright authentication state in an `always()` step.

## Normalized contract

Every source adapter produces the same four record types:

- Manager: stable source key, legal name, and verified CIK, aliases, or CRM company mapping when
  present.
- Filing: stable source key, manager key, verified SEC fields when present, and an explicit date
  basis.
- Security: stable source key plus only verified issuer, class, CUSIP, or ticker fields.
- Holding: stable row key, filing key, security key, and decimal-string values for value, shares,
  voting authority, and other official information-table fields when present.

Legacy CRM data has no verified CIK, accession number, CUSIP, SEC filed date, issuer name, or title
of class. The migration omits those values rather than inventing them. The CRM `asOfDate` is sent as
`legacyAsOfDate` with `dateBasis: LEGACY_AS_OF_UNVERIFIED`; it is never relabeled as an SEC report
period. Thematic target tickers, estimated values, sales contacts, portfolio percentages, movement
labels, and other derived workbook context are not sent.

Future SEC EDGAR adapters implement the same typed adapter interface but use `SEC_EDGAR` and
`COMPLETE`. Complete SEC batches must carry the official issuer, title of class, CUSIP, report
period, and any other information-table fields provided by the filing.

## Reconciliation and idempotency

The migration stops before a backend write if the CRM inventory is not exactly 28,320 rows. Each
source row is then classified exactly once as accepted, duplicate, or rejected. Duplicate counts
and rejection reason counts are retained in the aggregate receipt; individual source rows and raw
payloads are not retained.

The normalized dataset is canonically serialized and SHA-256 hashed. That digest defines both the
content identity and the stable batch key. The backend protocol is:

1. `POST /api/internal/thirteen-f/ingestions/:batchKey/begin`
2. ordered `POST /api/internal/thirteen-f/ingestions/:batchKey/chunks`
3. `POST /api/internal/thirteen-f/ingestions/:batchKey/complete`

Chunks contain at most 400 typed items, below the backend limit of 500 items and 5 MiB. A batch can
contain at most 100 chunks. Every chunk has its own canonical SHA-256. Replaying the same batch,
sequence, and digest is a no-op; a conflicting digest fails closed. Completion validates expected
counts and references before publishing the immutable filing revisions and current pointers.

The migration verifies that backend received counts equal the normalized counts before writing the
local receipt. Per-company mappings returned by the backend are discarded from that receipt because
the backend mapping service owns CRM company-marker synchronization.

## In-memory legacy workbook adapter

The package retains a legacy workbook adapter only for controlled conversion of existing source
bytes. It accepts a bounded `Uint8Array`, parses the two authoritative holdings sheets in memory,
and returns the typed contract. It does not accept a path, URL, filename, storage identifier, or
upload destination. Its output excludes raw rows and all non-13F sales context. Callers discard the
input bytes after normalization; no source blob is part of a request or receipt.

## Verification receipt

The schema-three receipt contains only:

- source system and coverage classification;
- aggregate content digest;
- source, accepted, duplicate, and rejected row counts;
- aggregate rejection reason counts;
- normalized record counts; and
- backend batch ID, status, received counts, published counts, and completion time.

The step summary contains the same aggregate subset. There is no workflow artifact.

## Purging historical source blobs

Do not delete historical CRM or object-storage data until a completed receipt proves all 28,320
source rows were accounted for and the canonical backend counts reconcile. Purge execution is a
separate root-owned production operation. Before deletion, produce a read-only inventory containing
the exact CRM record ID, CRM storage-object ID, bucket/key, and S3 version ID for each candidate;
join it to the reconciled migration receipt; and require zero unaccounted source rows. Versioned S3
objects require explicit version IDs—deleting only the current key can leave recoverable historical
versions. The migration workflow itself has no delete or storage capability.
