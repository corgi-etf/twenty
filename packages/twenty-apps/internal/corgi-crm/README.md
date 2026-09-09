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

Version `1.1.0` adds the Telegram channel and must be published as a new
immutable app version; it must not reuse the baseline `1.0.0` release.

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
access to Wholesaler and OutreachActivity; and no other object, delete, global,
or settings permission.

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
configuration, forwarded secret header, least-privilege role, and exact webhook
→ queued worker plus 15-minute cron → queued delivery-worker topology without
printing any secret values.

Optional live checks are isolated behind `yarn verify:telegram:live`. The script
does no network work unless
`CORGI_CRM_TELEGRAM_LIVE_VERIFICATION_CONFIRM=VERIFY_TELEGRAM_LIVE` is set. It
checks `getMe` and `getWebhookInfo` against
`CORGI_CRM_TELEGRAM_WEBHOOK_URL`. The invalid-update signed/unsigned route
canary additionally requires
`CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM=RUN_SIGNED_CANARY`. A real test message
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
`/cancel` clears any draft without a CRM write and `/help` shows the syntax. The
cron runs every 15 minutes, gates on the configured local time using IANA rules,
and admits deterministic per-member/day delivery jobs. Each worker revalidates
the WorkspaceMember-to-Wholesaler ownership immediately before reading or
sending. It records intent before every Telegram API call. A proven HTTP/API
rejection is retryable; a timeout, network failure, crash after intent, or other
ambiguous result is marked unknown and is never resent. This deliberate
at-most-once policy prevents duplicate daily messages, but an ambiguous delivery
can omit that part and all later parts until an operator reviews it.
