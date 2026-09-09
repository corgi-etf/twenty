import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
  const application = {
    applicationVariables: [
      { key: 'CORGI_CRM_WORKSPACE_ID', value: 'workspace-1' },
      { key: 'CORGI_CRM_TELEGRAM_BOT_TOKEN', value: 'masked' },
      { key: 'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET', value: 'masked' },
      { key: 'CORGI_CRM_TELEGRAM_LINK_CODES', value: 'masked' },
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
        }),
      },
      {
        universalIdentifier: '32cf139c-a4bf-4d87-84f4-f70ac39a3942',
      },
      {
        universalIdentifier: 'e61bb12c-a0f5-421b-97d2-e2596e56cf59',
        cronTriggerSettings: JSON.stringify({ pattern: '*/15 * * * *' }),
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
});
