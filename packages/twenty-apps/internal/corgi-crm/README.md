# Corgi CRM app

This internal Twenty app owns Corgi-specific CRM automation. It does not own the
existing `Wholesaler` object, which was created before this app.

## Installation order

1. Run `crm-workspace-metadata-bootstrap.yml` from the exact SHA deployed to
   both CRM services. Supply its exact successful run and attempt to step 2.
2. Run `corgi-crm-app-production.yml` from that same exact SHA. It verifies the
   bootstrap evidence before its schema preflight, then publishes, installs,
   and reconciles the app-created WorkspaceMember links.
3. Run `crm-territory-identity-discovery.yml` from the same SHA and supply the
   successful app-install run and attempt. This read-only phase emits only the
   three immutable WorkspaceMember UUIDs and an aggregate hash.
4. Run `crm-workspace-config.yml` from the same SHA, supplying all three UUIDs
   explicitly plus the discovery run and attempt. The workflow rejects UUIDs
   that differ from the PII-safe discovery artifact before any mutation.
5. The app workflow exports `CORGI_CRM_WORKSPACE_ID` from the integrity-checked
   metadata-bootstrap artifact only after it exactly matches the authenticated
   current workspace. No production workspace UUID is embedded in the app or
   verifier. Do not publish or install this tenant-specific app elsewhere.

Version `1.2.0` adds native meeting bookings, separate meeting report totals,
and configurable Telegram event destinations. It retains the server-compatible
delivery enum storage from `1.1.1`. Published versions are immutable: `1.1.0`
and `1.1.1` were published but failed installation and must not be overwritten
or reused.

Version `1.2.1` adds an opt-in public read path for whole-workspace Telegram
reports while keeping identity-scoped reads and CRM writes authenticated.

The three custom CRM objects predate this app, so their universal identifiers are
not guessed or committed. Immediately before packaging, use the short-lived
deployment credential to resolve them from live metadata into the job
environment:

```text
CORGI_CRM_ROLE_ENV_PATH=$GITHUB_ENV node packages/twenty-apps/internal/corgi-crm/scripts/verify-production-install.mjs role-env
```

That mode fails unless it finds exactly one active `wholesaler`,
`outreachActivity`, and `leadAssignment` object with UUID universal identifiers.
It exports `CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER`,
`CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER`, and
`CORGI_CRM_LEAD_ASSIGNMENT_OBJECT_UNIVERSAL_IDENTIFIER`. The least-privilege
role requires all three at build time. The installed verifier checks the exact
14 object grants, field provenance protection, relation targets, unique indexes,
and database trigger contracts. Ordinary users cannot edit application-managed
lifecycle timestamps or scheduler provenance.

The generated Core SDK describes standard objects and this application's own
objects; granting access to an existing workspace object does not add it to
that client schema. Queries and writes involving existing Wholesalers and
Outreach Activities therefore use the typed raw Core GraphQL transport. It
retains the runtime's delegated/application identity and the same server-side
permissions, sends values only as variables, and fails closed on malformed or
partial responses. Standard-object queries and app-owned scalar operations
continue to use the generated SDK. No deployment credential is retained by
the application.

The post-install function reconciles all existing WorkspaceMembers. The
`workspaceMember.created` trigger keeps future members synchronized. Both paths
reuse a case-insensitive email match, create a deterministic record ID from the
WorkspaceMember ID when no match exists, and fail closed on ambiguous matches.
They default the custom `wholesalerRole` field (displayed as “Role”) and do not
allocate leads.

The production workflow verifies the live ECS image digest, authenticated
workspace, required schema, installed version, active database trigger, and
one-to-one member reconciliation. It authenticates with the existing production
smoke-test credentials, creates a uniquely named 30-minute API key for the run,
masks its token, and always attempts verified revocation. No persistent app
deployment credential belongs in the manifest, workflow, or repository.

## Book a meeting in the CRM

Open **Meetings**, create a draft, and fill in the meeting name, **RIA / Company**,
**Owner**, and **Scheduled at** date and time. Change **Status** to **Booked**
when those details are ready. Incomplete bookings return to Draft with an
explanation in **Booking check**. The table, calendar, and native record page
use the same meeting record.

The first valid booking stamps **Booked at** and, when available, **Booked by**.
Those fields cannot be edited by ordinary CRM users. Reports count when the
meeting was booked, not its future scheduled date. Rescheduling, completing,
cancelling, or reopening the same record does not count a second booking or
send another booked alert. Historical bookings remain counted after a later
cancellation. A meeting booking does not create an extra outreach activity.

When the meeting's **Owner** is a BDR, the booking also needs an **EW /
external wholesaler** — the external wholesaler the meeting is attributed to.
The check reads the owner's own `wholesalerRole` when the booking happens and
applies only when that role reads exactly `BDR`, ignoring case and surrounding
spaces. There is no list of people anywhere in this app, so the rule turns on
one Wholesaler at a time as roles are filled in, with no release involved. An
owner whose role is empty, still the legacy `Wholesaler` default, unrecognised,
or unreadable books exactly as it did before, because a rule that guessed would
stop the whole workspace from booking meetings. Unlike **Booked at** and
**Booked by**, ordinary CRM users select the EW themselves.

Meetings booked before this rule shipped keep their empty EW and are never
rewritten. The Meetings table shows **EW / external wholesaler** next to
**Owner**, so filtering that column on empty finds the ones worth revisiting.

A meeting that names an EW also needs an **Allocation requested** amount: the
money the RIA asked to allocate, as the EW reports it. It is a currency field,
so it carries its own amount and currency code, which is what a future
per-EW attribution will need. An explicitly entered `0` is a real answer and
books; only a missing amount holds the booking in Draft. Nothing defaults or
back-fills the amount, and a meeting with no EW is never asked for one.

## Company allocations

Every company record carries an **Allocations** section listing one row per
ticker. A row holds a **Ticker** and an **Amount**, and both are typed directly
by CRM users — unlike **Booked at** or **Booked by**, nothing in the app writes
them. Add, edit, and remove rows from the section on the company, or work the
`companyAllocation` object directly.

**Ticker** is deliberately free text. Real symbols carry dots, hyphens, and
suffixes (`BRK.B`, `RY-PA.TO`, `7203.T`), and this is a CRM rather than an
exchange feed, so the app neither rejects nor rewrites what is typed. Nothing
normalizes case, so `aapl` and `AAPL` stay distinct strings.

Nothing stops two rows carrying the same ticker for one company. That is
usually a data-entry mistake, but a unique constraint would reject the empty
row the section's add button creates and would block the transient duplicate a
correction produces, so duplicates are left visible and correctable instead.

**Amount** is a Twenty currency field, the same composite `opportunity.amount`
and `company.annualRevenue` use, so it stores `amountMicros` plus a currency
code, formats and sums like every other money field, and follows the workspace
currency rather than assuming dollars in the column.

Destroying a company destroys its allocations; an allocation carries no meaning
once the company it belongs to is gone. Soft-deleting a company leaves them
alone.

## Outreach activity ownership

Every new Outreach Activity gets an owner. When a record is created without a
**Wholesaler**, the `outreachActivity.created` trigger assigns the Wholesaler
linked to the WorkspaceMember in the record's **Created by**, falling back to
the acting member on the event. A Wholesaler chosen while logging the activity
is never replaced: the trigger stops before reading the CRM when the create
event already carries one, and its write filters on a still-empty owner, so a
retry or a competing selection cannot overwrite a real choice.

The trigger leaves the owner empty and reports why when the creator cannot be
resolved to exactly one Wholesaler — an API or system actor with no member, a
member the onboarding reconciliation has not linked yet, or a member linked to
more than one Wholesaler. It never guesses an owner. Activities created before
this trigger shipped keep their empty owner until they are backfilled.

## Telegram outreach channel

Telegram is a thin channel over the app's `outreach` domain. The domain owns
local-day boundaries, activity grouping, summaries, and fail-closed CRM logging;
the Telegram module only authenticates updates, queues commands, formats replies,
and schedules delivery. This keeps the same outreach services reusable by a web,
email, or other messaging channel.

Configure these app variables in **Settings → Apps → Corgi CRM → Variables**.
There are deliberately no token, user, chat, schedule, or time-zone defaults in
source:

- `CORGI_CRM_TELEGRAM_ENABLED`: defaults to `false`; the production workflow
  changes it to `true` only after trusted configuration and live provider
  verification complete.
- `CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED`: defaults to `false`. When set
  to exactly `true`, any Telegram user in a private chat, or in a group topic
  listed in `CORGI_CRM_TELEGRAM_GROUP_TOPICS`, can request `/daily`, `/weekly`,
  or `/monthly`. It does not authorize `/log`, `/today`, `/summary`, linking, or
  any other CRM read or write.
- `CORGI_CRM_TELEGRAM_BOT_TOKEN` (secret): token from BotFather.
- `CORGI_CRM_TELEGRAM_WEBHOOK_SECRET` (secret): a new random Telegram webhook
  secret token.
- `CORGI_CRM_TELEGRAM_OPERATOR_SECRET` (secret): independent proof required in
  addition to authenticated Twenty access for redacted unknown-delivery
  inspection or reset.
- `CORGI_CRM_TELEGRAM_LINK_CODES` (secret): explicit one-to-one bindings of a
  code, WorkspaceMember UUID, and Telegram user ID. Codes, members, and users
  must each be unique:

```json
{
  "bindings": [
    {
      "code": "random-one-time-code",
      "workspaceMemberId": "11111111-1111-4111-8111-111111111111",
      "telegramUserId": "101"
    }
  ]
}
```

- `CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES` (secret): optional destinations for
  CRM event alerts. An unset value or `{}` sends no alerts. Use the numeric
  Telegram chat/channel ID, and include `messageThreadId` only for a forum
  topic. Each event/destination/topic combination must be unique:

```json
{
  "version": 1,
  "routes": [
    {
      "event": "meeting_booked",
      "chatId": "-1001234567890",
      "messageThreadId": 42
    }
  ]
}
```

- `CORGI_CRM_TELEGRAM_GROUP_TOPICS` (secret): optional allowlist of the
  supergroup forum topics allowed to run commands. An unset value or `{}` keeps
  every group refused, which is the default. Each entry needs both a supergroup
  chat ID and the forum topic's `messageThreadId`; a topic-less entry is
  rejected because it would admit the whole supergroup, General topic included.
  Each chat/topic pair must be unique:

```json
{
  "version": 1,
  "topics": [
    {
      "chatId": "-1002394851554",
      "messageThreadId": 304311
    }
  ]
}
```

Read both values off the topic's message link: `t.me/c/<chat>/<topic>/<message>`
gives the topic in the middle segment, and the Bot API chat ID is
`-(1000000000000 + <chat>)` — so `t.me/c/2394851554/304311/…` is chat
`-1002394851554`, topic `304311`. An allowlisted topic serves `/daily`,
`/weekly`, `/monthly`, and `/help` only. `/link`, `/log`, `/today`, `/summary`,
and `/start CODE` are refused out loud with a pointer to a direct message: a
link binds one chat to one WorkspaceMember, so a group — which has no single
sender identity — must never write CRM data or reveal one person's activity.
Replies always carry the topic's `message_thread_id`, so they land in the topic
that asked rather than in General. The webhook checks the allowlist on
admission and the worker checks it again before processing, so removing an entry
stops in-flight commands too.

The `meeting_booked` event sends `🎉 NEW MEETING BOOKED! 🎉` with the RIA,
scheduled date, owner, booking timestamp, and the booking user when a human name
is available. It never includes ARR. Only the first valid transition into a
booked state alerts; reschedules and later status changes do not alert again.

- `CORGI_CRM_TELEGRAM_TIME_ZONE`: an IANA zone such as `America/Chicago`.
- `CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME`: `HH:MM` on a 15-minute boundary.

When Telegram enablement is explicitly selected, the production workflow first
validates all trusted inputs and writes them while the runtime remains disabled.
It then registers the exact workspace route with Telegram `setWebhook`, passing
the same webhook secret as `secret_token` and subscribing only to `message` and
`callback_query`. It verifies `getMe`, `getWebhookInfo`, and signed/unsigned
route canaries before enabling the runtime. Keep provider and operator secrets
in the secret store; never put them in arguments, workflow inputs, source, or
logs.

Run `yarn verify:telegram` with the same short-lived production verification
environment used by `verify:production`. It checks the installed variable
configuration, forwarded secret header, least-privilege role, and exact webhook
→ queued worker plus 15-minute cron → queued delivery-worker topology without
printing any secret values.

Live checks are isolated behind `yarn verify:telegram:live`. The script does no
network work unless
`CORGI_CRM_TELEGRAM_LIVE_VERIFICATION_CONFIRM=VERIFY_TELEGRAM_LIVE` is set. It
registers and checks the exact webhook plus `getMe` and `getWebhookInfo` against
`CORGI_CRM_TELEGRAM_WEBHOOK_URL`. The signed/unsigned invalid-update canaries
also require `CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM=RUN_SIGNED_CANARY`. A real test message
requires all three of `CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED=true`,
`CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM=SEND_TELEGRAM_TEST`, and an explicit
`CORGI_CRM_TELEGRAM_TEST_CHAT_ID`. Load the token and webhook secret from the
secret store; never put them in arguments or logs.

Users start a private chat with `/link CODE`. Successful linking persists only
the Telegram/CRM identities, never the code or a code hash. The quickest logging
form is `/log call | Company | outcome | notes`. The explicit form supports an
optional contact and follow-up:

```text
/log type=meeting; company=Company; contact=Name; outcome=follow_up_scheduled; notes=Send deck; followup=2026-09-12
```

`/today` (or `/summary`) returns that person's current local-day breakdown.
`/daily`, `/weekly`, and `/monthly` return whole-workspace activity and
meeting-booking totals plus one leaderboard, over 1, 7 (local weekend events
excluded), or 30 reporting days. A reporting day runs from 5am to 5am in
`CORGI_CRM_TELEGRAM_TIME_ZONE`, so it follows the wall clock rather than a
rolling count of hours and is 23 or 25 hours long across a daylight saving
transition; every period ends at the next 5am boundary, so the day under way is
included and every earlier day is whole. Each leaderboard row carries that
person's calls/emails/linkedin triple and their meetings set, and rows are
ranked by meetings set, then activities, then name, then ID. `activityType`
values outside `phone_call`, `email` and `linkedin` still count toward the total
and are simply absent from the triple. Owners come from the records themselves;
there is no fixed people list, and meeting-only owners are ranked too. The
leaderboard splits into `BDR` and `EW` from `wholesalerRole` alone, compared
case-insensitively and trimmed because the value is human-entered; anyone whose
role is neither -- unset, the legacy default, or a word this app was never
taught -- is ranked in the `BDR` group rather than dropped. Two EW sections
follow: meetings taken by each EW, and ARR attributed per EW. Every ARR figure
is `$0` because no ARR source is connected yet, and
`PLACEHOLDER_ATTRIBUTED_ANNUAL_RECURRING_REVENUE` in
`report-summary.service.ts` is the single place a real source replaces. When no
record carries the role both sections keep their heading and say so, and when
the role read fails they say that instead -- an unpopulated field never reads as
a missing feature, and an unreadable one never reads as an empty one. With roles
unreadable the leaderboard stays a single ungrouped ranking. These three
aggregate reports are available without a CRM link only
when `CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED` is exactly `true`; Telegram's
signed webhook, private-chat-or-allowlisted-topic restriction, workspace fence,
update deduplication, and durable reply delivery still apply. `/help` shows the syntax;
there is no `/cancel` command because the bot does not hold mutable drafts. The
cron sends the same whole-workspace reporting-day report to each securely
linked recipient. It runs every 15 minutes. From the configured local
time until that local date ends, every tick addresses the same deterministic
per-member job, so missed ticks and restarts catch up without creating a second
daily admission. A nonexistent DST wall time uses the first valid minute after
the gap; a repeated wall time uses its first occurrence. Prior dates are never
replayed automatically. Each worker revalidates WorkspaceMember-to-Wholesaler
ownership immediately before reading or writing.

Every interactive reply, callback answer, and daily message part records intent
before the Telegram API call. A proven provider rejection is retryable. A
timeout, network failure, crash after intent, or failed post-send checkpoint is
marked unknown and is never automatically resent. This deliberate at-most-once
policy prevents duplicate messages but can under-deliver. Unknown events emit a
redacted alert containing only an opaque delivery key, timestamp, and reason
code. An operator can inspect that exact key through the authenticated
`/telegram/delivery-control` route with the independent operator secret. A reset
requires the exact `unknownAt` version, a unique request UUID, explicit
`RESET_UNKNOWN_TELEGRAM_DELIVERY` confirmation, and an audit reason. The audit
is written before one deterministic retry job; stale or completed-state replay
is rejected.

### Unknown-delivery operations

Use an authenticated Twenty session to `POST /telegram/delivery-control` and
load `x-corgi-telegram-operator-secret` from the secret store. Never place the
operator secret in a URL, command argument, source file, or ticket. Inspection
accepts only the opaque key and returns no message or recipient content:

```json
{
  "action": "inspect",
  "deliveryKey": "telegram:delivery:<64 lowercase hex characters>"
}
```

Unknown `Telegram delivery` records are searchable in CRM. Before recovery,
inspect the exact record and independently verify that Telegram has no receipt
for the original operation. If a resend is safe, submit one reset using the
returned `unknownAt`, a new UUID request ID, the exact confirmation string, and
a reason of at least 10 characters:

```json
{
  "action": "reset",
  "deliveryKey": "telegram:delivery:<64 lowercase hex characters>",
  "expectedUnknownAt": "2026-09-09T22:00:00.000Z",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "confirmation": "RESET_UNKNOWN_TELEGRAM_DELIVERY",
  "reason": "Provider confirmed that no message was accepted"
}
```

The route returns `202` only after the immutable database audit exists and the
deterministic retry is admitted. `Telegram delivery audit` records are
searchable in CRM and retain only the reason SHA-256 digest, actor member ID,
opaque delivery key, request ID, generation timestamp, and request time. They
are retained indefinitely: the app role has no delete permission and there is
no automatic purge. Treat any future retention change as a reviewed migration,
not an operator cleanup action.

## Experience release 1.3.0

Activity titles use `Type - Company - YYYY-MM-DD` in America/Chicago. Blank and
Untitled titles are managed automatically; intentional custom titles survive
later edits. Imports use the same formatter and preserve custom titles on replay.

Scheduling a dated follow-up creates a durable Outreach Follow-up, self-assigned
Task, and the scheduler's Lead Assignment. Existing assignments to other people
remain intact. The follow-up records the immutable scheduler separately from its
current assignee. Clearing the date cancels the reminder; task completion updates
its history. A new `followUpRequestKey` represents an intentional new request.
Missing company links remain visible and can be repaired later.

Meetings set use first `bookedAt`; meetings taken use `COMPLETED` plus explicit
`heldAt`. `heldRecordedAt` records when completion was first validated, and
`takenBy` credits the person who held it. Allocations receive immutable `loggedAt`
and `loggedBy` only after a positive amount, currency, ticker, and compatible
company/contact/meeting links are valid. Validation messages exclude invalid
corrections from reports. Manual `activeClient` remains separate from the distinct
companies with valid allocations metric.

Company Ownership is a junction with one unique company/wholesaler pair. It
preserves legacy account/historical owners; backfilling their authoritative
member mapping is handled by the workspace configuration package.

## Reviewed experience backfill

Install 1.3.0 and verify its metadata before previewing. Run from this directory
with `CORGI_CRM_URL` and `CORGI_CRM_WORKSPACE_ID`. Preview accepts a read-only
`CORGI_CRM_API_KEY` or an admin session `CORGI_CRM_ACCESS_TOKEN`:

```sh
node scripts/experience-backfill.mjs preview /secure/path/experience-preview.json
```

Review every operation and unresolved row. The manifest includes a SHA-256 digest,
source evidence, original values, and the expected update timestamp. It proposes
only blank/Untitled titles and valid historical allocation `loggedAt` values using
the original CRM `createdAt` as an explicit fallback. It never invents meeting
completion timestamps, overwrites custom titles, or sends Telegram messages.

Apply requires `CORGI_CRM_ACCESS_TOKEN` for an authorized administrator with
Applications and Workflows permissions. The command resolves the installed
untriggered maintenance function, temporarily approves exactly the reviewed
digest, and invokes it with its owning application identity. Ordinary API keys
cannot write the protected fields directly.

```sh
node scripts/experience-backfill.mjs apply /secure/path/experience-preview.json /secure/path/experience-journal.jsonl REVIEWED_SHA256
```

Each write compares the live source and update timestamp; changed records are
reported as conflicts. The journal records intent before execution and original
values after confirmed writes. Re-running the identical manifest is idempotent.
Review conflicts through a fresh preview. Keep the manifest/journal outside the
repository, restrict their file permissions, and retain them for rollback review.
The approval variable is cleared on normal completion or a handled failure; if the
process is forcibly stopped, clear `CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST` in app
settings before starting unrelated maintenance. Rollback requires a separately
reviewed owning-application operation against the journal's saved timestamps.

### Controlled server-task alternative

When no browser session is available, an authorized operator can run the same
manifest from an existing server Nest application context. Keep execution in the
installed CRM release, with the same identity, digest, current-workspace checks,
and journal as the CLI. Do not alter resolver guards or create another admin.
Resolve the existing authorized administrator's `core.user.id` and matching active
`core.userWorkspace.id` for this workspace. Neither is a `workspaceMember` UUID.

Use these server providers (source module paths relative to `twenty-server`):

```ts
import { ApplicationVariableEntityService } from 'src/engine/core-modules/application/application-variable/application-variable.service';
import { LogicFunctionFromSourceService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source.service';
```

After resolving the installed application and function by the universal identifiers
checked in `experience-backfill.mjs`, the exact provider calls are:

```ts
await applicationVariables.update({
  key: 'CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST',
  plainTextValue: approvedDigest,
  applicationId,
  workspaceId,
});
try {
  // Record journal intent before each operation and result immediately after it.
  const result = await logicFunctions.executeOneFromSource({
    id: installedFunctionId,
    payload: { manifest, index },
    workspaceId,
    userId: authorizedAdminUserId,
    userWorkspaceId: authorizedAdminUserWorkspaceId,
  });
  // Require result.status === 'SUCCESS'; retain result.data in the journal.
} finally {
  await applicationVariables.update({
    key: 'CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST',
    plainTextValue: '',
    applicationId,
    workspaceId,
  });
}
```

`plainTextValue` has the server's branded `PlaintextString` type; apply that type at
the already-validated digest boundary in a typed command. The variable service
updates encryption and cache coherently. The execution service preserves the
administrator identity in execution context and logs; the installed maintenance
handler explicitly uses `TWENTY_APP_APPLICATION_ACCESS_TOKEN` for protected record
writes. It refuses to fall back to a user token or an API key. Close the Nest
context after the journal is flushed and approval cleanup is confirmed.

## Guarded GitHub experience rollout

`.github/workflows/crm-experience-rollout.yml` runs manually on `main` after both
server and worker are stable on that exact workflow SHA and app 1.3.0 is installed.
It uses the existing `CRM_E2E_LOGIN`, `CRM_E2E_PASSWORD`, and
`CRM_E2E_WORKSPACE_NAME` administrator session through Chromium and `page.request`.
It creates no API key. The authenticated workspace must be active **Corgi ETF**
and the user must have Data model, Applications, and Workflows permissions.

Choose one dataset per run:

- `configuration`: additive client/accent metadata and profile/layout settings.
  When the preview phase is `metadata`, apply it and create a new preview for
  `layout`; never apply a derived layout that was absent from the reviewed file.
- `ownership`: unique company/wholesaler links from authoritative legacy owner
  mappings. Preview requires `expected_company_count`; ambiguous mappings stop
  apply and require a corrected, fresh preview.
- `activities-allocations`: blank activity names and eligible historical allocation
  logging timestamps, using the owning-application maintenance function.

Run `operation=preview` with the exact `deployed_sha`. Download the private
`crm-experience-preview-DATASET-RUN_ID-ATTEMPT` artifact, review `manifest.json`
including every operation and unresolved row, and retain its outer `digest`.
Then run `operation=apply` with the same dataset/revision, `preview_run_id`,
`preview_run_attempt`, `reviewed_digest`, and confirmation
`APPLY_REVIEWED_CRM_EXPERIENCE`. The runner verifies that the artifact came from a
successful same-revision attempt of this exact workflow, verifies both digest
layers, and rechecks tenant/release and live source facts before writes.

Runs serialize with deployment workflows. The workflow refuses public repositories,
retains manifests/journals privately for seven days, and uploads only those explicit
files. Session state, local artifacts, and browser results are deleted afterward;
maintenance disables screenshots, traces, video, and automatic retries. It never
changes Telegram configuration or sends test messages, and compares the Telegram
configuration digest before and after each operation. A failure retains the private
apply journal for review. Configuration/ownership partial failures require a fresh
preview; activity/allocation operations use per-record compare-and-set fencing.

Ownership runs allow up to 120 minutes (150 minutes for the whole workflow), since
source checks are intentionally serialized and rate limited. Other datasets allow
20 minutes. Before any maintenance request, the browser runner requires the secure
HttpOnly `__Host-twenty-session` cookie to remain valid for the whole operation plus
15 minutes. These are opaque server sessions, whose configured default absolute
lifetime is 180 days and idle timeout 30 days; active API requests refresh activity.
The 30-minute access-JWT lifetime does not govern cookie-authenticated requests.
The runner neither extracts bearer tokens nor invokes legacy refresh-token renewal.
A short-lived or revoked session fails closed and preserves the apply journal.
