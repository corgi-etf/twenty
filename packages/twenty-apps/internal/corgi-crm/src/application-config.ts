import { defineApplication } from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  CORGI_CRM_PRODUCTION_WORKSPACE_ID,
} from 'src/constants';

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
      value: CORGI_CRM_PRODUCTION_WORKSPACE_ID,
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
        'JSON object mapping one-time /link codes to WorkspaceMember UUIDs. Codes are read at runtime and never persisted or logged.',
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
