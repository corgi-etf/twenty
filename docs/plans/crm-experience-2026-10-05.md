**Corgi CRM experience plan — October 5, 2026**

Build a useful, tile-based Home page; make records easy to create, link, and navigate; and make daily sales activity visible throughout the CRM. The first production improvement is reliable Outreach Activity names. Home and relationship design proceed in parallel with that repair.

This is a planning deliverable. Investigation used read-only production API queries and source review. No CRM records, workspace settings, messages, or deployments were changed. The supplied API key is not part of this document or the repository.

Implementation was authorized after planning. Added requirement: a **Current clients** tile beside the activity/meeting/allocation metrics counts distinct companies with at least one valid allocation. Clicking opens those companies and allocation counts/amounts broken down by credited salesperson/wholesaler and client contact. Keep this computed allocation-based metric separate from the staff-controlled Active client flag.

**Verified starting point**

Production workspace: Corgi ETF at `https://crm.corgiinvest.com`. Repository: `Corgi-ETF/twenty`; source baseline `41c61182b6493d877817def25048f1cdc2969d45`.

| Finding | Evidence and implication |
| --- | --- |
| 1,361 Outreach Activities | 32 have null, empty, or literal `Untitled` names. A whitespace/case-variant audit remains part of the backfill preview. The newest 20 have nonblank names, so naming varies by creation path; this is not a universal absence of names. |
| 2,841 Companies; 2,778 People | Company metadata has 68 fields and Person has 59, including system and relationship fields. The shared tables also expose many imported fields. Simplify common forms and views while retaining useful data in details. |
| 18 Wholesalers; 4,048 Lead Assignments | Reuse the existing Wholesaler ↔ Workspace Member identity mapping. Home must use bounded queries and server aggregates, not load all records into the browser. |
| 48 Meetings; 2 Allocations | Reuse `meetingBooking` and `companyAllocation`. Allocations already link to company, meeting, and credited wholesaler, but not contact/person. |
| Two dashboard records | One has an empty title and an empty layout; another is named `My First Dashboard`. Preserve them. Build a deliberate Home route rather than relying on a dashboard title. |
| Activity type is already a colored SELECT | Live values are Phone call, Email, LinkedIn, Meeting, Other. In the shared Outreach table it appears last. Configuration source still expects TEXT in places and must be reconciled before rerunning it. |
| No explicit active-client field on company/person | Add a clear, manually controlled client status to both. The user confirmed that allocations may suggest a change, but must not automatically change the status. |
| Individual ownership fields already exist | Company has both native `accountOwner` and `historicalOwner` (displayed as Wholesaler). Inventory and preserve both when adding multiple owners. |
| Follow-up automation is partial | Installed app has an Outreach created trigger that can create a Task from `followUpDate`. It does not create a Lead Assignment and does not handle a follow-up date added later. |
| Reporting needs correction | Source can count a draft as a booking through a `createdAt` fallback; some reports label an owner's booked meetings as “meetings taken.” There is no authoritative completed-meeting timestamp yet. |
| Home/full pages are not missing infrastructure | Desktop login currently selects the first readable navigation item; `/home` is mobile-oriented. Generic full-page record layouts, notes widgets, relation tables, and permission-aware realtime already exist. |
| Release compatibility needs verification | Public config reports Twenty `2.38.1`; Corgi app `1.2.36` is installed; current app source declares Twenty ≥`2.39.0`. Verify deployed image capabilities/version metadata before building on new APIs; do not assume either that an upgrade is required or that source declarations prove compatibility. |

The exact blank-name count came from a filtered aggregate query. A broader paginated audit timed out and is not claimed as completed. The plan does not infer production behavior from source alone where runtime verification is still needed.

**Product conventions to standardize first**

One shared convention registry should drive labels, titles, badges, record links, default columns, and form actions. These rules apply to Home, tables, profile pages, quick actions, notifications, and app/Telegram-created records.

| Concept | Standard |
| --- | --- |
| Objects | Company, Person, Wholesaler, Outreach Activity, Meeting, Allocation, Lead Assignment. Navigation uses plurals; headings/actions use consistent sentence case. “Salesperson” resolves to the existing employee/Wholesaler identity, not a new duplicate object. |
| Relationships | Company, Contact, Owners, Booked by, Credited wholesaler. Ownership, creation attribution, booking credit, and allocation credit remain distinct. Preserve existing API field names unless a migration is actually needed. |
| Activity title | `{Activity type} - {Company name} - {YYYY-MM-DD}`; e.g. `Phone call - Example Advisory - 2026-10-05`. Type uses the human-readable label; date uses the activity date in the workspace reporting timezone. |
| Other titles | Companies/people retain their real names. Meetings get an editable default `Meeting - {Company} - {scheduled date}`. Allocations retain the ticker as their existing identifier, displayed with company, amount, and date. Lead assignments show company/contact and assignee context. |
| Dates | Store instants in UTC; show local dates/times with the reporting timezone clearly identified. Default proposal is `America/Chicago`, midnight-to-midnight. Do not silently reuse the existing Telegram reports' 5am day boundary. |
| Money | Preserve `amountMicros` and currency code. Show formatted currency; never sum different currencies into an unexplained dollar total. “Allocation amount” is not revenue or assets under management. |
| Actions | Save, Cancel, Link existing, Create new, Change, Remove link, Open profile, View all. “Remove link” never deletes the related record. |
| Client status | Staff-controlled `Active client` / `Not marked active` status on companies and people, using an explicit boolean and shared labeled badge. Active clients are green. Do not assume every contact at an active company is personally an active client. |
| Company type | Normalize a documented taxonomy from existing `firmType` values. Use colored type badges; preserve original values during mapping and send unknown values to a review list. Do not overwrite data to force a guessed taxonomy. |
| Color | Keep one activity-type palette everywhere; initially preserve existing live SELECT colors. Use distinct labeled event badges for meeting booked, meeting taken, and allocation. Status colors retain their meaning under every personal theme; include text/icons as well as color. |
| Forms | Required essentials first; secondary fields under More details; inline errors preserve input; Cancel creates no empty record; retries cannot double-submit. Read-only/import provenance fields are not routine creation inputs. |

**Release sequence and parallel work**

| Milestone | What ships | Prerequisites / completion gate |
| --- | --- | --- |
| 0 — Contracts and preview | Final title/link/metric conventions; compatibility check; live schema/config diff; title and ownership migration previews; Home layout specification. | Audit access and baseline are established. Remaining decisions use the defaults in this plan unless changed. No production data migration during planning. |
| 1 — Priority activity repair | Universal activity naming, controlled backfill, Activity type first in activity tables, Outreach moved near the top, canonical record links/full-profile opening. | Every write path covered; meaningful existing titles preserved; configuration rerun retains the layout. |
| 2 — Real Home | Responsive default landing page, four accurate Today tiles plus the Current clients tile, persistent compact header, latest five records, My work, meeting agenda, team performance and trends, quick actions. | Booking/completion/logged-allocation definitions implemented; totals reconcile to drill-down lists. Base relationship picker and links available. Build this in parallel with milestone 1 rather than leaving Home until the end. |
| 3 — Profiles and simpler daily work | Rich full-page profiles; unified relationship editing; short company form; manual client badges; multiple company owners; contact-linked allocations; reliable self follow-up assignments; record-level notes. | Additive schemas and identity mappings verified; all creation entry points use the same behavior; no ownership or notes data lost. |
| 4 — Live team experience and appearance | Linked in-app notifications, reliable live refresh, creator confetti, personal accent palettes, consistent semantic colors throughout. | Authoritative events and source-record permission checks verified; duplicate/reconnect behavior tested with two users. |

Workstreams: (A) schema and workspace configuration; (B) domain automation, metrics, and events; (C) Home and shared UI/linking; (D) profiles/forms/appearance and independent QA. Each implementation teammate gets a named isolated branch/worktree, focused commits, and explicit file ownership. The lead reviews and owns push/PR/merge. Runtime/data changes are reviewed as concrete diffs/manifests; no task should require an unrelated infrastructure apply.

**Priority repair: Outreach Activity titles**

Use one formatter and managed-title policy across native quick log, the app command, inline/table creation, API-driven creation, Telegram, and supported import paths. UI paths calculate the name before saving; a guarded create/update reconciliation covers paths that bypass those forms and inline records filled in over several edits.

Use `occurredAt` for the date, with `createdAt` only as a documented fallback when occurrence is unknown. If company is absent but the linked contact has one unambiguous company, derive that relationship according to the shared linking rules. Otherwise use an honest fallback such as `Company not linked`; use `Activity` when the type is absent. Do not invent a company or prevent logging a legitimate unlinked activity. Update an automatically managed title when its generating fields change; preserve an explicitly edited title and offer Reset to automatic.

Backfill starts with the verified 32 exact matches, plus any whitespace/case variants found by the preview. Produce old/new title, record ID, source values, and expected `updatedAt`; patch conditionally to avoid replacing concurrent edits. Retain a rollback journal and unresolved counts. Do not mass-rewrite all 1,361 records. Use the same naming contract for relation chips, search results, and latest records so a saved title actually appears everywhere.

Activity tables, including embedded activity lists, use: **Type → Activity → Company → Contact → Owner → Occurred at → Outcome → Follow-up**. System timestamps/provenance move to details. Verify whether the table currently forces its label column first; if so, make a focused change so Type is truly first without losing title navigation or row selection.

Acceptance: each supported creation path yields the requested title; filling an inline record cannot leave a permanent Untitled name; existing custom titles remain unchanged; retries are no-ops; missing-company cases stay readable; backfill counts reconcile; clicking a title opens its full record.

**Robust Home and the persistent top area**

`/home` becomes the desktop and mobile default when login has no requested destination. Preserve deep links and login return paths. The two existing Dashboard records remain accessible under Analytics; Home does not depend on their mutable titles.

| Screen position | Tile / region | Content and behavior |
| --- | --- | --- |
| Top | Metric tiles | Activities today; Meetings set today; Meetings taken today; Allocation amount logged today; **Current clients**. Current clients counts distinct companies with valid allocations across all time, not just today. Each is a large, legible clickable tile on Home and a compact strip on other working pages. Scope and timezone are visible. |
| Immediately below | Latest five | The five latest saved, permitted business records across activities, meetings, allocations, companies, people, wholesalers, lead assignments, tasks, and notes. Show type color/icon, name, creator, time, and canonical link. Exclude technical join/audit records and empty placeholders. Notes link to their associated record's Notes section where appropriate. |
| Primary work area | My follow-ups | Overdue, due today, and upcoming work, with company/contact, due date, and one-click open/complete actions. Completed work leaves the queue. Counts come from the same criteria as View all. |
| Primary work area | My follow-up companies | Every company this person marked for follow-up, grouped by company with next due date, contact, reason, last activity, and status. Includes future-dated work; searchable/paginated View all is not restricted to today's tasks. Expanding a company shows each underlying reminder. |
| Primary work area | Today's meetings | Local-time agenda with company, contact when known, owner, and status. Book, open, reschedule, and mark taken use the same actions as the Meeting profile. |
| Primary work area | Team performance | One row per active employee, including zero-activity employees. Activities, set/taken meetings, credited allocations, and follow-up workload. Name opens profile; numbers open corresponding filtered lists. Clearly separate logged-by from credited-to attribution. |
| Secondary work area | Activity trends | Daily volume and type breakdown for 7/30 days or a custom range, with employee/team filters. Clearly label the range; changing it does not change the persistent Today header. |
| Secondary work area | Clients and allocations | My/team explicitly active clients, recent allocations, and relevant owned-company links. Show recorded allocations with currency/ticker/company; keep requested amounts separate. |
| Secondary work area | Live wins | Recent booked/taken meetings and recorded allocations with actor, readable context, and link. The persistent notification history also makes dismissed events recoverable. |
| Header actions | Quick actions | Log activity, Book meeting, Record allocation, Create company. Forms share the same defaults and relationship controls used elsewhere. |

Home should answer: **What happened today? What should I do next? Who is doing the work? Where do I click to act?** It must not be just a grid of navigation shortcuts.

The compact Today strip **and the latest-five list remain available at the top of every ordinary working page**, not just Home. On mobile, metric cards reflow and a clearly labeled Recent records control expands the same five-item list. Home prioritizes the KPI tiles, My follow-ups, meeting agenda, and team summary in its initial load; trends, clients/allocations, and live-wins history load independently afterward.

Default Today scope is the permitted team; allow My work/team/person selection where useful and label it. My follow-ups remains explicitly personal. Every statistic uses the same underlying definition as the profile and filtered list. Lists are bounded with View all; company, contact, and employee searches are paginated.

Each tile has independent loading, empty, unavailable, and error/retry states; a failed tile cannot blank Home. Zero is shown only after a successful query. Keep the last successful numbers visible with an updated-at/stale indicator during reconnect. Refresh on relevant changes, reconnect, tab refocus, and local day rollover. The live event layer ultimately replaces unnecessary polling; a bounded refresh fallback covers stream failure.

Proposed performance acceptance targets, measured against current data and staging-like conditions: first useful Home content within 2 seconds at p95, and committed changes reflected in healthy connected sessions within 5 seconds. These are engineering targets to validate, not current measured performance. Avoid browser-side full scans and per-row query fan-out; index timestamp/relationship filters only when query plans show a need.

**Metric definitions that prevent misleading numbers**

| Metric | Source and timestamp | Counting and attribution rules |
| --- | --- | --- |
| Activities today | Outreach Activity `occurredAt`; explicit `createdAt` fallback for legacy unknown occurrence | Count unique nondeleted business activities. Type breakdown uses the SELECT taxonomy. Attribute work to activity owner; creator remains separately visible. Do not create a synthetic extra activity for a meeting solely to inflate this metric. |
| Meetings set today | First valid `bookedAt` | Exclude drafts; do not fall back to arbitrary creation time. Count a booking once through later reschedules/status changes. Booked by identifies the setter, while Owner/Credited wholesaler remain distinct dimensions. |
| Meetings taken today | New authoritative `heldAt` plus completed state | Taken means the meeting actually occurred, not that it was assigned to an external wholesaler. Capture who took it and actual time. Later corrections update aggregates without replaying first-occurrence celebrations. Do not infer a historical completion date from `updatedAt`. |
| Allocation amount logged today | New `loggedAt` stamped on first valid submission; documented `createdAt` fallback for valid historical rows where justified | This is **logged today**, as requested, not `allocationDate`. Store effective allocation date separately for historical analysis. Exclude incomplete placeholders; one save counts once. Corrections change the relevant total rather than add another allocation. Group by currency or show an explicitly labeled USD total plus other-currency totals. |
| Current clients | Distinct company IDs on valid, nondeleted allocations, across all time | Exclude missing-company/empty allocation placeholders. Multiple allocations or multiple owners do not multiply the company count. Click to open the filtered client-company screen, with company allocation count, amount by currency, last allocation, and person attribution. Break out credited wholesaler/salesperson and client contact separately; missing person attribution is Unassigned. The manual Active client flag is independent. |
| Last five created | Business-record `createdAt DESC, id DESC` | Use creation time, not last edit or economic event date. Filter by permissions and valid saved-record rules; deduplicate records. Imports do not generate live celebration storms. |

A booking timestamp, actual meeting time, allocation effective date, and time entered into the CRM are different facts. Persist those distinctions and share tested helpers rather than letting each widget improvise its own definition. Keep current Telegram report behavior intact until its counting changes are explicitly covered by tests and release notes; show its 5am boundary if it remains different.

Repair meeting transitions across the whole path: create/status handler gates, repository conditional writes and readback, and Telegram notification snapshot validation currently contain BOOKED-only checks. A service-only change accepting COMPLETED will not repair direct Draft→Completed or a valid booking whose status changes before delivery. Test these paths together while preserving existing external delivery deduplication and destinations.

**Simple linking everywhere**

Create one shared record link and one relationship picker. A displayed record name opens its full profile; a separate Change/Link action edits the association. A selection inside a picker selects the record rather than unexpectedly navigating. Support keyboard activation, browser Back, opening in a new tab, and copied deep links.

The picker follows **Search existing → Select → Create new if needed**. Show disambiguating information: company plus city/state/domain; person plus company; meeting plus company/date/status; wholesaler plus role/territory. Prioritize context-related results, but permit an explicit broader search. Warn about likely duplicates before creating a new company/contact. Inline creation returns the new record selected, with the originating draft preserved.

Every dialog focuses its first meaningful input and restores focus to its launching action when closed. Keyboard order and Enter behavior are consistent; Save disables duplicate submission. Opening a linked profile to inspect it and returning must preserve the originating form draft, selected relationships, and scroll context. Failed saves keep all entered values and show the field or service problem.

| Starting context | Automatically linked when creating related work |
| --- | --- |
| Company profile | Company prefilled for activity, contact, meeting, allocation, follow-up, or note |
| Person profile | Contact prefilled and its current company proposed; do not silently move the person |
| Meeting profile | Meeting and its company prefilled for allocation; contact proposed if unambiguous |
| Wholesaler profile | Wholesaler prefilled where the user is intentionally recording work for that person; show actual creator separately |
| Existing activity | Company/contact carried into follow-up; actor controls Assign to me without replacing another person's assignment |

Validate incompatible company/contact/meeting combinations on the server as well as the client. Changing company flags or clears incompatible selections with an explanation; it must not silently relink existing records. Link changes update inverse sections, counts, and search context everywhere. Removing an optional relationship does not delete the record; required relationships explain why removal is blocked. Show explicit unavailable/deleted states instead of dead links.

Allocate one native `companyAllocation.contact → person` relationship, with the inverse on Person. Add meeting contact/participant relationships where needed for the same contextual linking flow. Start with a clear primary contact and add a junction only if multiple participants are required by real usage. Company, contact, and meeting can all be associated in a single short allocation form; prefill what is already known.

Allocation Save validates ticker, amount/currency, company, and relevant associations. Existing incomplete inline rows remain editable but do not count as logged allocations or trigger notifications until valid. Preserve existing flexible ticker strings and duplicate-ticker correction behavior; do not add an unrelated market-data validation requirement.

**Full profiles, company creation, client status, and ownership**

Use Twenty's existing full-page RecordShowPage and page-layout widgets. Normal clicks on companies, people, wholesalers, and salespeople open full pages; Preview is an explicit secondary action. Employee/Workspace Member chips currently have a nonclickable special case: resolve them through the authoritative Wholesaler mapping, with a clear state for unmapped people.

Profiles share Overview, Activity, Related records, Notes, and Files conventions. Company/Person profiles show contact facts, manual client status, owners, recent activity, follow-ups, meetings, and allocations. Wholesaler profiles show role/territory, Today and range-based statistics, all owned companies/active clients, all activities, lead assignments, tasks, meetings set/taken, and credited allocations. Each salesperson/Wholesaler dashboard and profile also has **Follow-up companies**, scoped to that person rather than the viewer or company owner. Paginate related lists and make every count open the exact set it summarizes. Historical/disabled wholesalers keep their records; don't remove them to hide zero activity.

The short Company form exposes Name (required), Website/domain, City, State, Owners, LinkedIn, Company type, and Active client. Collapse remaining editable fields under More details. Set sensible ownership defaults but allow multiple selections. Use the native composite address and link types; `stateRegion`/`postalCode` are existing projections and must not become competing sources of truth. Every New company entry point uses Save/Cancel without creating a blank record before Save.

Multiple owners use an additive `companyOwnership` junction between Company and Wholesaler; use a unique company/owner pair and an explicit primary owner for compatibility where required. Resolve both `accountOwner` and `historicalOwner` through the member/wholesaler mapping, seed memberships, deduplicate equivalent identities, and report conflicts/unmapped values. Retain the legacy fields and define synchronization before switching consumers. Multiple owners do not multiply allocation totals or rewrite historical booking credit.

Client status is independent for Company and Person. Show a green Active client badge and filter in both lists, profiles, pickers, and relevant Home tiles. Allocation creation may offer “Mark company as an active client,” requiring an explicit action. Existing holdings or historical allocations are suggestions for review, never automatic proof of active status.

**Follow-up means assigned work**

Offer Schedule follow-up on every activity, with due date, optional description, and Assign to me selected by default. Follow-up is a workflow action, not a replacement for Phone call/Email/etc. The authenticated actor maps to the existing Wholesaler/Workspace Member identity; never trust an arbitrary client-provided actor or silently reuse an unrelated activity owner.

Create or explicitly reuse one appropriate open Lead Assignment for that person/company/contact, link it through `outreachActivity.assignment`, and create/update the existing reminder Task. Store the follow-up due date separately from assignment creation date. If a source activity already links someone else's assignment, preserve it and create a distinct self-follow-up relationship or require an explicit choice; do not steal/reassign their work. Define the one-to-many follow-up link additively if required to retain the existing assignment association.

Run on creation and on relevant later updates. Use deterministic operation/record identities, conditional backlinks, and recoverable partial-success handling so retries do not create another assignment/task/target. Rescheduling changes the existing reminder; completing/cancelling a follow-up updates that reminder/task and removes it from the open follow-up queue without deleting source activity. A reused Lead Assignment remains open if it has other work: close it only through an explicit assignment action or a separately agreed no-open-work rule. A repeated new follow-up after completion gets a deliberate new follow-up occurrence, not an accidental replay. Missing/ambiguous identity is a visible actionable error.

**Each person's Follow-up companies list** is a required dashboard feature, separate from the due-today task queue. Record who scheduled/flagged the follow-up as well as the assignee; source activity owner, company owner, and viewer are not substitutes for that provenance. The default list shows all open companies the selected person flagged, including future dates, sorted overdue first and then next due. All/Completed filters retain access to every company previously flagged, and Assigned to me provides the separate view of work handed over by someone else. Reassignment must not erase the original person's history.

Group by company ID, not company-name text. A company appears once with the next open follow-up date, contact(s), reason/summary, latest activity time, reminder count, and status; expand it to see the underlying reminders/assignments. Clicking its name opens the full Company profile. Completing one reminder leaves the company in the open list while another open reminder exists; completing the last moves it to the completed/history view. Search and pagination must expose the entire matching set. An unlinked activity remains in a clearly labeled Needs company link queue until resolved, rather than disappearing. Older reminders with unknown scheduler need an explicit legacy/unattributed state; do not fabricate who flagged them.

**Notes, navigation, colors, and celebrations**

Proposed sidebar order: **Home → Outreach Activities → Follow-ups → Meetings → Companies → People → Wholesalers → Allocations → Team analytics**, followed by permission-appropriate secondary tools. Keep existing needed administrative tools under More/Admin. Update the workspace reconciler so future configuration runs preserve this order and do not delete desired items.

Remove the standalone shared Notes navigation entry. Retain native Note/NoteTarget data and put Notes on every relevant record. Inventory existing plain-text/rich-text notes and imported notes; show them in context or migrate once with provenance/deduplication. Do not delete or strand unlinked notes: retain an administrator cleanup view until they have appropriate targets. Never infer a target from text alone.

In-app notifications appear for all logged-in users in this workspace who may read the source record, regardless of which working page they are on. Events are Meeting booked, Meeting taken, and Allocation logged. Each notification has readable context, actor/time, and a link. A small persistent notification history lets users recover dismissed or missed items.

Persist a unique event identity and separate effective time from recorded time. Integrate with the existing authenticated SSE transport and its reconnect handling. An event object's own visibility is insufficient: enforce the source record's object, row, and field permissions before exposing even a title, amount, ID, or existence-sensitive notification. Restricted users must not learn hidden records through counts or badges. Re-evaluate access when following a link and handle deleted records clearly.

Debounce authoritative metric/feed refetches; do not maintain financial totals by optimistic local increments. Suppress duplicate/replayed toasts after reconnect. Imports/backfills/corrections do not replay first-occurrence announcements. Preserve existing Telegram destinations and delivery semantics; this request adds in-app notifications, not new external messages.

Confetti appears once for the creator after successfully saving a meaningful Meeting or Allocation; an empty inline placeholder or failed validation is not a success. For a later Book meeting action, use the existing toast/live event rather than celebrating the same create twice. Respect reduced motion and allow celebrations to be disabled; other users receive the notification, not repeated full-screen effects. Animation is nonblocking.

Appearance settings add saved personal accent palettes (for example Blue, Teal, Violet, Warm) alongside Light/Dark/System. They change navigation/accent surfaces, not business status meanings. Persist per user across sessions and cover dialogs, menus, side panels, charts, focus states, and interface scale. Curated contrast-tested palettes ship first; unrestricted color picking is unnecessary to satisfy personal color choice.

**Implementation boundaries and existing source to reuse**

| Responsibility | Existing source / change location |
| --- | --- |
| Home routing and shared header | [default route hook](../../packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts), [workspace routes](../../packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx), [shared layout](../../packages/twenty-front/src/modules/ui/layout/page/components/DefaultLayout.tsx) |
| Record pages and links | [RecordShowPage](../../packages/twenty-front/src/pages/object-record/RecordShowPage.tsx), [RecordChip](../../packages/twenty-front/src/modules/object-record/components/RecordChip.tsx), existing relation widgets and canonical record route helpers |
| View/navigation/source-of-truth configuration | [workspace planner](../../packages/corgi-crm-workspace-config/src/planner.ts), [execution](../../packages/corgi-crm-workspace-config/src/execution.ts), canonicalization metadata and migration packages |
| Activity defaults/follow-ups | [created handler](../../packages/twenty-apps/internal/corgi-crm/src/modules/outreach/on-outreach-activity-created.logic-function.ts), outreach logging services, [follow-up reconciliation](../../packages/twenty-apps/internal/corgi-crm/src/modules/outreach/services/reconcile-follow-up.service.ts), native quick-log hook |
| Meeting semantics | [reconciliation service](../../packages/twenty-apps/internal/corgi-crm/src/modules/meeting/services/reconcile-meeting-booking.service.ts), create/status handlers, conditional repository writes and notification snapshot validation |
| Aggregates | [current report summary](../../packages/twenty-apps/internal/corgi-crm/src/modules/outreach/services/report-summary.service.ts); reuse domain helpers only after fixing definitions. Its ARR zero placeholder must not power a real dashboard. |
| Realtime | [workspace providers](../../packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx), existing SSE query listeners/reconnect hooks, [permission-aware publisher](../../packages/twenty-server/src/engine/subscriptions/object-record-event/object-record-event-publisher.ts) |
| Personal appearance | Existing `useColorScheme`, appearance settings, and [ThemeProvider](../../packages/twenty-ui/src/theme-constants/ThemeProvider.tsx); preserve root UI-scale handling when adding palettes |
| Runtime permissions | [app default role](../../packages/twenty-apps/internal/corgi-crm/src/default-role.ts), installed-role verifier and application metadata |

App-owned fields, domain functions, and event contracts belong in the Corgi CRM app. Home, persistent header/subscriber, shared linking, and appearance need changes in the Twenty fork; an on-demand app front component cannot replace the persistent application shell. Workspace views and navigation belong in the convergent configuration package. Retain current React/Jotai/Linaria and generated contracts rather than introducing a parallel UI framework.

Add only the precise permissions required for assignments, allocation reads/writes, owner memberships, and event processing, and update the verifier's exact expected grants. Validate with normal user roles as well as the administrator/API identity. Snapshot metadata before migration; use discovered universal IDs rather than hardcoding production IDs into reusable source.

**Validation and release gates**

1. Title formatter and backfill tests cover all creation paths, missing data, timezone changes, custom titles, concurrent edits, and idempotent reruns. Validate both stored names and rendered record labels.
2. Metrics test midnight/DST boundaries, backdated activities, cancelled/rescheduled meetings, direct Draft→Completed, duplicate events, multi-currency allocations, edits/deletions, and ownership versus creator attribution. No source row may be counted merely because it exists as a draft.
3. Follow-up tests inject partial failure after assignment creation, task creation, target creation, and backlink attachment; replay recovers without duplicate work. Include date added later, reschedule, cancellation/completion, ambiguous identity, and another owner's existing assignment. Every company flagged by a person appears in that person's Follow-up companies list, including future work; multiple reminders group once, completing one does not hide remaining work, reassignment preserves history, another person's profile uses their scope, and pagination exposes the complete set.
4. Relationship tests cover every creation entry point, contextual defaults, search ambiguity, inverse visibility, stale selections, cross-company mistakes, remove-link versus delete, and preserved drafts during errors/navigation.
5. Home/profile tests reconcile every tile to its drill-down records, keep zero-activity employees, distinguish denied/unavailable from zero, bound network calls, and verify reload/deep-link/mobile behavior. Verify plain-text legacy notes remain reachable.
6. Two real test sessions on different pages verify notification delivery, source permissions, refresh, deduplication, reconnect, deleted-record links, creator-only confetti, and reduced motion. Canary records explicitly suppress external Telegram delivery.
7. Configuration dry-run and rerun tests prove navigation, first activity column, client badge, owner fields, and visible company fields survive reconciliation. Resolve SELECT/TEXT drift before applying the configuration.
8. Verify deployed server/worker image compatibility, then follow the existing same-revision deployment/bootstrap/app-install/configuration workflow. Separate additive schema, app behavior, frontend enablement, and data backfill so each has a concrete read-back check and rollback boundary.

Release behind a workspace-scoped flag with staged enablement. Roll back UI/automation flags and prior application versions independently; retain additive data and migration journals instead of destructively reversing schema under new records. A release is complete only when deployed behavior, normal-role access, and the original user journeys are verified.

**Defaults and remaining choices**

Confirmed: manual active-client status; name repair first; robust Home; simple linking and consistent conventions throughout; each person's dashboard/profile lists all companies they marked for follow-up.

Proposed defaults: midnight-to-midnight America/Chicago reporting; Owners means internal sales/Wholesaler identities; primary contact for a Meeting/Allocation with additive multiple-contact support only where needed; shared Home layout with per-user filters and palette; curated accent choices; use occurrence date for activities, booked time for meetings set, actual held time for meetings taken, and logged time for the allocation header. Finalize these in the implementation specification; none blocks this plan.

**Coverage check**

| Requested outcome | Planned home |
| --- | --- |
| Squares after login / real high-level homepage | Dedicated responsive Home, five metric tiles, work queues, agenda, team table, trends, live wins, quick actions |
| Wholesaler whole-screen profile / all stats, activities, clients, allocations, today | Full-page native layouts, canonical employee links, paginated related sections, shared metrics |
| Active company/person flag; existing clients green | Explicit manual client status, green badge/filter everywhere |
| Simpler company creation | Short canonical form, More details, no blank record before Save |
| More than one owner | Additive company-owner junction and safe mapping from both legacy owner fields |
| Activity type first / Outreach higher | Shared/embedded view changes plus reconciled sidebar |
| Follow-up creates lead assignment for self | Authenticated self action, Lead Assignment + Task coordination, create/update handling |
| Every person's dashboard lists their follow-up companies | Dedicated company-grouped list, all open dates plus complete history, scheduler attribution, expandable reminders and company links |
| Confetti on Meeting/Allocation create | Once per successful meaningful local create, accessible and nonblocking |
| Click through every entity / easier association | Shared record links, contextual searchable picker, inline create, allocation-contact relationship |
| Daily activity dashboard | Team table, accurate Today counters, explicit analytics ranges and drilldowns |
| Activity default names instead of Untitled | First-priority universal formatter, managed defaults, conditional audited backfill |
| Record-level notes instead of global Notes section | Native target-linked notes, legacy note preservation, global navigation removed |
| Live clickable notifications to logged-in users | Persisted deduplicated events, existing SSE, per-source permissions, notification history |
| Four global Today metrics / last five created objects | Shared persistent header state, recorded-time allocation amount, mixed recent list |
| Current clients beside the other metrics / allocation attribution drill-down | Fifth tile counts distinct allocated companies across all time; linked company list and allocation counts/amounts grouped by credited salesperson and client contact |
| Personal colors and more semantic color | Per-user palette, one accessible taxonomy for status/type/event colors |
| Standardized conventions / robust linking and Home | Shared contracts, consistent actions and relationships, tested accuracy/performance/error states |
