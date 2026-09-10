import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  resolveCorgiRoleObjectIdentifiers,
  verifyApplicationRoleContract,
  verifyReconciliation,
  verifyTelegramApplicationContract,
  verifyTelegramDisabled,
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
      { key: 'CORGI_CRM_TELEGRAM_ENABLED', value: 'true' },
      { key: 'CORGI_CRM_TELEGRAM_BOT_TOKEN', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_OPERATOR_SECRET', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_LINK_CODES', value: '********' },
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
      {
        universalIdentifier: 'c77df778-3268-4d34-a3d8-84e7478cb567',
        httpRouteTriggerSettings: JSON.stringify({
          path: '/telegram/delivery-control',
          httpMethod: 'POST',
          isAuthRequired: true,
          forwardedRequestHeaders: ['x-corgi-telegram-operator-secret'],
        }),
      },
      {
        universalIdentifier: '70e86a19-fbdd-4d17-aa36-f0b2ab62305b',
      },
    ],
  };

  it('accepts installed variables and the webhook/worker/cron topology', () => {
    assert.doesNotThrow(() =>
      verifyTelegramApplicationContract(application, 'workspace-1'),
    );
  });

  it('verifies an explicit disabled state without requiring provider secrets', () => {
    assert.doesNotThrow(() =>
      verifyTelegramDisabled(
        {
          applicationVariables: [
            { key: 'CORGI_CRM_WORKSPACE_ID', value: 'workspace-1' },
            { key: 'CORGI_CRM_TELEGRAM_ENABLED', value: 'false' },
          ],
        },
        'workspace-1',
      ),
    );
    assert.throws(
      () => verifyTelegramDisabled(application, 'workspace-1'),
      /not disabled/i,
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

  it('treats secret metadata as an opaque configured mask', () => {
    const blankSecret = {
      ...application,
      applicationVariables: application.applicationVariables.map((variable) =>
        variable.key === 'CORGI_CRM_TELEGRAM_LINK_CODES'
          ? { ...variable, value: '' }
          : variable,
      ),
    };
    assert.doesNotThrow(() =>
      verifyTelegramApplicationContract(application, 'workspace-1'),
    );
    assert.throws(
      () => verifyTelegramApplicationContract(blankSecret, 'workspace-1'),
      /configured/i,
    );
  });

  it('rejects invalid IANA zones, schedule boundaries, or header forwarding', () => {
    const replaceVariable = (key, value) => ({
      ...application,
      applicationVariables: application.applicationVariables.map((variable) =>
        variable.key === key ? { ...variable, value } : variable,
      ),
    });
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
          isActive: true,
        },
        {
          nameSingular: 'outreachActivity',
          universalIdentifier: '44444444-4444-4444-8444-444444444444',
          isActive: true,
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
            isActive: true,
          },
        ]),
      /exactly one|uuid/i,
    );
  });
});

describe('installed application role verification', () => {
  const objects = [
    'workspaceMember',
    'company',
    'person',
    'wholesaler',
    'outreachActivity',
  ].map((nameSingular, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    nameSingular,
  }));
  const writable = new Set(['wholesaler', 'outreachActivity']);
  const role = {
    canAccessAllTools: false,
    canBeAssignedToUsers: false,
    canBeAssignedToAgents: false,
    canBeAssignedToApiKeys: false,
    canReadAllObjectRecords: false,
    canUpdateAllObjectRecords: false,
    canSoftDeleteAllObjectRecords: false,
    canDestroyAllObjectRecords: false,
    canUpdateAllSettings: false,
    permissionFlags: [],
    fieldPermissions: [],
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
    workspaceMembers: [],
    agents: [],
    apiKeys: [],
    objectPermissions: objects.map(({ id, nameSingular }) => ({
      objectMetadataId: id,
      canReadObjectRecords: true,
      canUpdateObjectRecords: writable.has(nameSingular),
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
  };

  it('accepts only the exact five-object least-privilege role', () => {
    assert.doesNotThrow(() => verifyApplicationRoleContract(role, objects));
  });

  it('fails closed when any tool, assignment, flag, field, or row capability is missing or non-empty', () => {
    for (const key of [
      'canAccessAllTools',
      'canBeAssignedToUsers',
      'canBeAssignedToAgents',
      'canBeAssignedToApiKeys',
      'permissionFlags',
      'fieldPermissions',
      'rowLevelPermissionPredicates',
      'rowLevelPermissionPredicateGroups',
      'workspaceMembers',
      'agents',
      'apiKeys',
    ]) {
      const missing = { ...role };
      delete missing[key];
      assert.throws(
        () => verifyApplicationRoleContract(missing, objects),
        /capability|assignment|permission|collection/i,
      );
      assert.throws(
        () =>
          verifyApplicationRoleContract(
            {
              ...role,
              [key]: key.startsWith('can') ? true : [{ id: 'unexpected' }],
            },
            objects,
          ),
        /capability|assignment|permission|collection/i,
      );
    }
  });

  it('rejects duplicate object permissions even when the count remains five', () => {
    assert.throws(
      () =>
        verifyApplicationRoleContract(
          {
            ...role,
            objectPermissions: role.objectPermissions.map((permission, index) =>
              index === 4
                ? {
                    ...permission,
                    objectMetadataId: role.objectPermissions[0].objectMetadataId,
                  }
                : permission,
            ),
          },
          objects,
        ),
      /unexpected|duplicate/i,
    );
  });

  it('rejects a global, extra, or excessive object permission', () => {
    assert.throws(
      () =>
        verifyApplicationRoleContract(
          { ...role, canReadAllObjectRecords: true },
          objects,
        ),
      /global/i,
    );
    assert.throws(
      () =>
        verifyApplicationRoleContract(
          {
            ...role,
            objectPermissions: [
              ...role.objectPermissions,
              {
                objectMetadataId: '99999999-9999-4999-8999-999999999999',
                canReadObjectRecords: true,
                canUpdateObjectRecords: false,
                canSoftDeleteObjectRecords: false,
                canDestroyObjectRecords: false,
              },
            ],
          },
          objects,
        ),
      /exactly five/i,
    );
    assert.throws(
      () =>
        verifyApplicationRoleContract(
          {
            ...role,
            objectPermissions: role.objectPermissions.map((permission) =>
              permission.objectMetadataId === objects[1].id
                ? { ...permission, canUpdateObjectRecords: true }
                : permission,
            ),
          },
          objects,
        ),
      /company/i,
    );
  });

  it('queries every capability needed for fail-closed live verification', async () => {
    const source = await fs.readFile(
      new URL('./verify-production-install.mjs', import.meta.url),
      'utf8',
    );
    for (const field of [
      'canAccessAllTools',
      'canBeAssignedToUsers',
      'canBeAssignedToAgents',
      'canBeAssignedToApiKeys',
      'permissionFlags { id }',
      'fieldPermissions { id }',
      'rowLevelPermissionPredicates { id }',
      'rowLevelPermissionPredicateGroups { id }',
      'workspaceMembers { id }',
      'agents { id }',
      'apiKeys { id }',
    ]) {
      assert.match(source, new RegExp(field.replace(/[{}]/g, '\\$&')));
    }
  });
});
