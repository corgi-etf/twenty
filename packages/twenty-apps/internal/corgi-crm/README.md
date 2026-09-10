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

The two custom CRM objects predate this app, so their universal identifiers are
not guessed or committed. Immediately before packaging, use the short-lived
deployment credential to resolve them from live metadata into the job
environment:

```text
CORGI_CRM_ROLE_ENV_PATH=$GITHUB_ENV node packages/twenty-apps/internal/corgi-crm/scripts/verify-production-install.mjs role-env
```

That mode fails unless it finds exactly one active `wholesaler` and one active
`outreachActivity` object with UUID universal identifiers. It exports
`CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER` and
`CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER`; the least-privilege
role requires both at build time. The installed verifier then checks the actual
role has read-only access to WorkspaceMember, Company, and Person; read/write
access to Wholesaler, OutreachActivity, and the app-owned TelegramDelivery and
TelegramDeliveryAudit objects; read/update access to MeetingBooking; and no
other object, delete, global, or settings permission. It also verifies the
app-owned object schemas and the three unique indexes that fence delivery
claims, reset generations, and request replays.

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
`/daily`, `/weekly`, and `/monthly` return separate whole-workspace activity and
meeting-booking totals, activity and outcome breakdowns, an activity leaderboard,
and a meeting-booking leaderboard for the rolling last 24 hours, 7 days (local
weekend events excluded), or 30 days. Owners come from the records themselves;
there is no fixed people list. Meeting-only owners appear on the booking
leaderboard. These three aggregate reports are available without a CRM link only
when `CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED` is exactly `true`; Telegram's
signed webhook, private-chat-or-allowlisted-topic restriction, workspace fence,
update deduplication, and durable reply delivery still apply. `/help` shows the syntax;
there is no `/cancel` command because the bot does not hold mutable drafts. The
cron sends the same whole-workspace rolling-24-hour report to each securely
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
