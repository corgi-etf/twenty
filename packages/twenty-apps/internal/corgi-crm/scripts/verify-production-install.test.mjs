import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  resolveCorgiRoleObjectIdentifiers,
  verifyReconciliation,
  verifyTelegramApplicationContract,
} from './verify-production-install.mjs';

const member = {
  id: 'member-1',
  userEmail: 'Damien@Corgi.com',
  name: { firstName: ' Damien ', lastName: ' Wiese ' },
};
const wholesaler = {
  id: 'wholesaler-1',
  name: 'Damien Wiese',
  email: 'damien@corgi.com',
  wholesalerRole: 'Wholesaler',
  workspaceMemberId: 'member-1',
};

describe('production reconciliation verification', () => {
  it('accepts one exact wholesaler identity per usable member', () => {
    assert.deepEqual(
      verifyReconciliation({ members: [member], wholesalers: [wholesaler] }),
      { members: 1, wholesalers: 1 },
    );
  });

  it('rejects duplicate identities matched by member ID or normalized email', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [member],
          wholesalers: [
            wholesaler,
            {
              ...wholesaler,
              id: 'wholesaler-2',
              workspaceMemberId: null,
            },
          ],
        }),
      /has 2 identities/,
    );
  });

  it('rejects links to absent workspace members', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [],
          wholesalers: [wholesaler],
        }),
      /link to absent workspace members/,
    );
  });

  it('rejects identities without the custom wholesaler role field', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [member],
          wholesalers: [{ ...wholesaler, wholesalerRole: null }],
        }),
      /stale identity/,
    );
  });
});

describe('production Telegram application verification', () => {
  const workspaceMemberId = '11111111-1111-4111-8111-111111111111';
  const application = {
    applicationVariables: [
      { key: 'CORGI_CRM_WORKSPACE_ID', value: 'workspace-1' },
      { key: 'CORGI_CRM_TELEGRAM_BOT_TOKEN', value: 'masked' },
      { key: 'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET', value: 'masked' },
      {
        key: 'CORGI_CRM_TELEGRAM_LINK_CODES',
        value: JSON.stringify({
          bindings: [
            {
              code: 'secret-link-code',
              workspaceMemberId,
              telegramUserId: '101',
            },
          ],
        }),
      },
      { key: 'CORGI_CRM_TELEGRAM_TIME_ZONE', value: 'America/Chicago' },
      { key: 'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME', value: '17:00' },
    ],
    logicFunctions: [
      {
        universalIdentifier: 'a7693988-ab2a-4f07-b865-b4d4808c814a',
        httpRouteTriggerSettings: JSON.stringify({
          path: '/telegram/webhook',
          httpMethod: 'POST',
          isAuthRequired: false,
          forwardedRequestHeaders: ['x-telegram-bot-api-secret-token'],
        }),
      },
      {
        universalIdentifier: '32cf139c-a4bf-4d87-84f4-f70ac39a3942',
      },
      {
        universalIdentifier: 'e61bb12c-a0f5-421b-97d2-e2596e56cf59',
        cronTriggerSettings: JSON.stringify({ pattern: '*/15 * * * *' }),
      },
      {
        universalIdentifier: 'a518c1f8-d80c-4260-8ef6-bd51a86b4eda',
      },
    ],
  };

  it('accepts installed variables and the webhook/worker/cron topology', () => {
    assert.doesNotThrow(() =>
      verifyTelegramApplicationContract(application, 'workspace-1'),
    );
  });

  it('rejects a missing secret declaration or changed cron schedule', () => {
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          {
            ...application,
            applicationVariables: application.applicationVariables.slice(1),
          },
          'workspace-1',
        ),
      /variable/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          {
            ...application,
            logicFunctions: application.logicFunctions.map((logicFunction) =>
              logicFunction.universalIdentifier ===
              'e61bb12c-a0f5-421b-97d2-e2596e56cf59'
                ? {
                    ...logicFunction,
                    cronTriggerSettings: JSON.stringify({ pattern: '0 0 * * *' }),
                  }
                : logicFunction,
            ),
          },
          'workspace-1',
        ),
      /cron/i,
    );
  });

  it('rejects malformed or duplicate link bindings', () => {
    const withLinkValue = (value) => ({
      ...application,
      applicationVariables: application.applicationVariables.map((variable) =>
        variable.key === 'CORGI_CRM_TELEGRAM_LINK_CODES'
          ? { ...variable, value }
          : variable,
      ),
    });
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          withLinkValue('{not-json'),
          'workspace-1',
        ),
      /link|json/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          withLinkValue(
            JSON.stringify({
              bindings: [
                {
                  code: 'one',
                  workspaceMemberId,
                  telegramUserId: '101',
                },
                {
                  code: 'two',
                  workspaceMemberId:
                    '22222222-2222-4222-8222-222222222222',
                  telegramUserId: '101',
                },
              ],
            }),
          ),
          'workspace-1',
        ),
      /duplicate/i,
    );
  });

  it('rejects invalid UUIDs, IANA zones, schedule boundaries, or header forwarding', () => {
    const replaceVariable = (key, value) => ({
      ...application,
      applicationVariables: application.applicationVariables.map((variable) =>
        variable.key === key ? { ...variable, value } : variable,
      ),
    });
    const badUuid = replaceVariable(
      'CORGI_CRM_TELEGRAM_LINK_CODES',
      JSON.stringify({
        bindings: [
          { code: 'one', workspaceMemberId: 'member-1', telegramUserId: '101' },
        ],
      }),
    );
    assert.throws(
      () => verifyTelegramApplicationContract(badUuid, 'workspace-1'),
      /uuid/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          replaceVariable('CORGI_CRM_TELEGRAM_TIME_ZONE', 'Mars/Olympus'),
          'workspace-1',
        ),
      /time zone/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          replaceVariable('CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME', '17:07'),
          'workspace-1',
        ),
      /15-minute/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          {
            ...application,
            logicFunctions: application.logicFunctions.map((logicFunction) =>
              logicFunction.universalIdentifier ===
              'a7693988-ab2a-4f07-b865-b4d4808c814a'
                ? {
                    ...logicFunction,
                    httpRouteTriggerSettings: JSON.stringify({
                      path: '/telegram/webhook',
                      httpMethod: 'POST',
                      isAuthRequired: false,
                    }),
                  }
                : logicFunction,
            ),
          },
          'workspace-1',
        ),
      /header/i,
    );
  });
});

describe('application release contract', () => {
  it('uses a new immutable app version for Telegram capability', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    assert.equal(packageJson.version, '1.1.0');
  });

  it('resolves exact custom object universal identifiers from live metadata', () => {
    assert.deepEqual(
      resolveCorgiRoleObjectIdentifiers([
        {
          nameSingular: 'wholesaler',
          universalIdentifier: '33333333-3333-4333-8333-333333333333',
        },
        {
          nameSingular: 'outreachActivity',
          universalIdentifier: '44444444-4444-4444-8444-444444444444',
        },
      ]),
      {
        CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER:
          '33333333-3333-4333-8333-333333333333',
        CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER:
          '44444444-4444-4444-8444-444444444444',
      },
    );
    assert.throws(
      () =>
        resolveCorgiRoleObjectIdentifiers([
          {
            nameSingular: 'wholesaler',
            universalIdentifier: 'not-a-uuid',
          },
        ]),
      /exactly one|uuid/i,
    );
  });
});
