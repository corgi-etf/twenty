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
5. The manifest defaults `CORGI_CRM_WORKSPACE_ID` to the approved Corgi CRM
   workspace. Do not publish or install this tenant-specific app elsewhere.

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

## Telegram outreach channel

Telegram is a thin channel over the app's `outreach` domain. The domain owns
local-day boundaries, activity grouping, summaries, and fail-closed CRM logging;
the Telegram module only authenticates updates, queues commands, formats replies,
and schedules delivery. This keeps the same outreach services reusable by a web,
email, or other messaging channel.

Configure these app variables in **Settings → Apps → Corgi CRM → Variables**.
There are deliberately no token, user, chat, schedule, or time-zone defaults in
source:

- `CORGI_CRM_TELEGRAM_BOT_TOKEN` (secret): token from BotFather.
- `CORGI_CRM_TELEGRAM_WEBHOOK_SECRET` (secret): a new random Telegram webhook
  secret token.
- `CORGI_CRM_TELEGRAM_LINK_CODES` (secret): JSON mapping one-time codes to
  WorkspaceMember UUIDs, for example `{ "random-code": "member-uuid" }`.
- `CORGI_CRM_TELEGRAM_TIME_ZONE`: an IANA zone such as `America/Chicago`.
- `CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME`: `HH:MM` on a 15-minute boundary.

After publishing and installing the app, register the exact workspace route
`https://crm.corgiinvest.com/s/telegram/webhook` with Telegram `setWebhook` and
pass the same webhook secret as `secret_token`. Subscribe only to `message` and
`callback_query` updates. Keep the bot token and webhook secret in a secret
manager or encrypted application variables; never put either value in a shell
argument, workflow input, source file, or log.

Run `yarn verify:telegram` with the same short-lived production verification
environment used by `verify:production`. It checks the installed variable
configuration and the exact webhook → queued worker plus 15-minute cron topology
without printing any secret values.

Users start a private chat with `/link CODE`. Successful linking persists only
the Telegram/CRM identities, never the code or a code hash. The quickest logging
form is `/log call | Company | outcome | notes`. The explicit form supports an
optional contact and follow-up:

```text
/log type=meeting; company=Company; contact=Name; outcome=follow_up_scheduled; notes=Send deck; followup=2026-09-12
```

`/today` (or `/summary`) returns that person's current local-day breakdown.
`/cancel` clears any draft without a CRM write and `/help` shows the syntax. The
cron runs every 15 minutes, gates on the configured local time using IANA rules,
and stores resumable per-person/per-day delivery claims so retries do not resend
already confirmed message parts.
