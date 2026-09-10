# corgi-crm-workspace-config

Owns the production workspace's object and field metadata, plus the managed
views, for `https://crm.corgiinvest.com`. Everything here runs through guarded
GitHub workflows; nothing runs unattended against production.

## Standing prohibition: never delete `outreachActivity.activityType`

**Do not delete the `activityType` TEXT field. Not when the dropdown replaces
it, not when it looks unused, not as cleanup.** Retire it by hiding it, or at
most by deactivating it, and leave the column in place.

The reason is not sentiment about the data. `corgi-crm-canonicalization`
verifies that each `archivedOutreachActivity` row is a faithful clone of its
canonical `outreachActivity`, comparing eight fields, `activityType` among them
(`corgi-crm-canonicalization/src/planner.ts`, `archivedComparableFields`). The
comparison reads the raw stored values with no normalisation.

Delete the live field and `canonical['activityType']` becomes `undefined`,
which `?? null` turns into `null`, while the archived row still holds its
original string. That mismatches on all five archived rows, so every subsequent
run raises `ARCHIVED_ACTIVITY_NOT_CLONE`, and both `assertPlanCanApply` and
`assertCanonicalizationComplete` throw. The canonicalization pipeline stops
until someone works out why, and the failure appears long after the deletion
that caused it.

Hiding the field and deactivating it both leave the stored value readable, so
neither trips the check.

## Retiring the TEXT field: use the weakest rung that works

1. **Hide it from views.** Preferred. The data, the column and the API response
   are all untouched, nothing goes near the clone check, and it is reversible by
   making the view field visible again.
2. **`isActive: false`.** Only if hiding proves insufficient. Hides the field
   everywhere at once including user-created views. See
   `src/field-deactivation.ts`; the capability exists but is wired to nothing.
   Before using it, confirm on a local dev instance that a deactivated field is
   still returned in REST record payloads. The evidence says it is
   (`getAllSelectableFields` does not filter on `isActive`) but that is
   inference from absent filtering, not proof, and the clone check depends on
   it. Do not confirm it in production.
3. **Delete.** Never. See above.

## Hiding `activityType` from the record page

Not implemented. Implementing it in the planner means it executes on the next
bootstrap dispatch, so it is written down rather than staged.

Twenty provisions an engine-owned `FIELDS_WIDGET` record-page view per object
and adds a view field for every field created, visible by default. So
`activityTypeOption` already appears on the record page, and `activityType`
still does too.

That view carries `key: null` — only `INDEX` persists a key
(`compute-system-view-to-create.util.ts`) — so it resolves by
`objectMetadataId` plus `type === 'FIELDS_WIDGET'`, not by key. Hiding the
field is then one view-field update setting `isVisible: false` on the entry
whose `fieldMetadataId` is `activityType`'s. That is the same mutation class
the planner already emits for the company and person index views.

Two limits worth knowing before choosing this rung:

- It reaches only workspace-owned views. The planner refuses to touch any view
  with a non-null `createdByUserWorkspaceId`, so a table view someone built by
  hand keeps showing the text field. Rung 2 is the only one that covers those.
- The managed Follow-ups view already excludes `activityType`
  (`FOLLOW_UP_VIEW_FIELD_NAMES`), so it needs no change.

## Reading the inventory

```bash
TWENTY_API_KEY=... npx nx run corgi-crm-workspace-config:activity-type-inventory
```

Reads production and writes nothing: it builds the read adapter, which owns no
mutation method, and there is no execute path in the runner. It prints every
distinct `activityType` value with a count and a disposition, and calls out the
values that need a human decision before any backfill can run. It also prints
the plan hash, which binds an approved plan to the exact dry run it came from.

`CORGI_CRM_API_KEY` is accepted as a fallback, since that is where the
production workflows already place a minted short-lived token.

### Verify on first write

`conditionalPatchOutreachActivity` assumes the update response arrives as
`body.data.updateOutreachActivities`, matching `updateManyResponseKey` in
`corgi-crm-canonicalization`. That has never been checked against a live
response. It affects the write path only, so the dry run is unaffected, and a
wrong key surfaces immediately as `Activity type backfill concurrency conflict`
rather than as bad data. Confirm it on the first real write.

## Activity type is a dropdown, stored UPPER_SNAKE

`activityTypeOption` is a `SELECT` bound to the taxonomy in
`twenty-apps/internal/corgi-crm/src/modules/outreach/quick-log-taxonomy.ts`.
Twenty rejects option values that are not `UPPER_SNAKE_CASE`, so the stored
encoding is `PHONE_CALL` while the app's internal vocabulary stays
`phone_call`. Encoding happens only at the persistence boundary.

Keep it there. `deterministicCompletedActivityId` in
`corgi-crm-activity-import` hashes the lowercase slug; move the encoding
earlier and every deterministic id changes, so re-running an old import creates
duplicate activities instead of colliding harmlessly.

Option ids are pinned in `src/planner.ts`. A re-bootstrap that minted fresh ids
would orphan every stored value, which is why option drift throws instead of
being repaired automatically.
