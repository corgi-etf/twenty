import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Corgi CRM',
  description: 'Corgi CRM territory and wholesaler automation.',
  applicationVariables: {
    CORGI_CRM_WORKSPACE_ID: {
      universalIdentifier: '2878690b-7830-4702-b78f-03822b77c12c',
      description:
        'Workspace ID allowed to run Corgi CRM automation. The member-created trigger fails closed for every other workspace.',
      isSecret: false,
      ...(process.env.CORGI_CRM_EXPECTED_WORKSPACE_ID
        ? { value: process.env.CORGI_CRM_EXPECTED_WORKSPACE_ID }
        : {}),
    },
    CORGI_CRM_TELEGRAM_ENABLED: {
      universalIdentifier: '64c93fe6-4db5-4ea3-a5d4-bc5370cc0fe7',
      description:
        'Fail-closed Telegram runtime gate. Remains false until trusted configuration and live provider verification both succeed.',
      isSecret: false,
      value: 'false',
    },
    CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED: {
      universalIdentifier: 'efed240f-6856-46f3-973c-67b429287e0a',
      description:
        'Allows any Telegram sender to request read-only whole-workspace daily, weekly, and monthly reports. Defaults off and does not authorize identity or CRM write commands.',
      isSecret: false,
      value: 'false',
    },
    CORGI_CRM_TELEGRAM_BOT_TOKEN: {
      universalIdentifier: 'e3cd12fd-524c-4414-a1ac-9885cb35f36b',
      description:
        'Telegram Bot API token. Set per workspace; never place this value in the manifest, source, logs, or a workflow input.',
      isSecret: true,
    },
    CORGI_CRM_TELEGRAM_WEBHOOK_SECRET: {
      universalIdentifier: '25ba20b1-b138-4f73-a37f-d04812324663',
      description:
        'Random secret supplied to Telegram setWebhook and required in the X-Telegram-Bot-Api-Secret-Token header.',
      isSecret: true,
    },
    CORGI_CRM_TELEGRAM_LINK_CODES: {
      universalIdentifier: '6bb517bc-1aa5-444a-ac98-6a35627d250b',
      description:
        'Secret JSON bindings of one-time /link codes to unique WorkspaceMember UUIDs and Telegram user IDs. Codes are read at runtime and never persisted or logged.',
      isSecret: true,
    },
    CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES: {
      universalIdentifier: '37f44e2b-3e0b-4343-8876-87a1263a913d',
      description:
        'Secret JSON routing allowlist for CRM event notifications. Empty configuration sends no event alerts.',
      isSecret: true,
    },
    CORGI_CRM_TELEGRAM_OPERATOR_SECRET: {
      universalIdentifier: 'bfc9cb27-1021-416b-a0d7-d34bb60df113',
      description:
        'Independent operator proof required in addition to authenticated Twenty access for unknown-delivery inspection and audited reset.',
      isSecret: true,
    },
    CORGI_CRM_TELEGRAM_TIME_ZONE: {
      universalIdentifier: '29d27825-8fa4-4cb5-9ed4-358c8f2bb72b',
      description:
        'IANA time zone used for CRM day boundaries and the daily Telegram schedule, for example America/Chicago.',
      isSecret: false,
    },
    CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME: {
      universalIdentifier: '17ac3613-58d2-4dcf-b67c-73dc82c3032f',
      description:
        'Local daily send time in HH:MM on a 15-minute boundary. No default is embedded in code.',
      isSecret: false,
    },
  },
});
