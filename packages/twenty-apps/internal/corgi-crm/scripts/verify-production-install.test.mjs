import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildSchema, parse, validate } from 'graphql';

import {
  buildMeetingCanarySuppression,
  resolveCorgiRoleObjectIdentifiers,
  verifyApplicationRoleContract,
  verifyInstalledApplication,
  verifyMeetingApplicationContract,
  verifyMeetingBookingSchema,
  verifyReconciliation,
  verifyTelegramApplicationContract,
  verifyTelegramDisabled,
  verifyTelegramPersistenceSchema,
} from './verify-production-install.mjs';

const verifierSource = await fs.readFile(
  new URL('./verify-production-install.mjs', import.meta.url),
  'utf8',
);
const applicationServiceSource = await fs.readFile(
  new URL(
    '../../../../twenty-server/src/engine/core-modules/application/application.service.ts',
    import.meta.url,
  ),
  'utf8',
);
const applicationEntitySource = await fs.readFile(
  new URL(
    '../../../../twenty-server/src/engine/core-modules/application/application.entity.ts',
    import.meta.url,
  ),
  'utf8',
);
const applicationDtoSource = await fs.readFile(
  new URL(
    '../../../../twenty-server/src/engine/core-modules/application/dtos/application.dto.ts',
    import.meta.url,
  ),
  'utf8',
);

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
      { key: 'CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED', value: 'false' },
      { key: 'CORGI_CRM_TELEGRAM_BOT_TOKEN', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_OPERATOR_SECRET', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_LINK_CODES', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_TIME_ZONE', value: 'America/Chicago' },
      { key: 'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME', value: '17:00' },
      { key: 'CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES', value: '********' },
      { key: 'CORGI_CRM_TELEGRAM_GROUP_TOPICS', value: '********' },
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

  it('requires the installed public-report policy to match the approved configuration', () => {
    const withPublicPolicy = (value) => ({
      ...application,
      applicationVariables: application.applicationVariables.map((variable) =>
        variable.key === 'CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED'
          ? { ...variable, value }
          : variable,
      ),
    });
    assert.doesNotThrow(() =>
      verifyTelegramApplicationContract(
        withPublicPolicy('true'),
        'workspace-1',
        'true',
      ),
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(application, 'workspace-1', 'true'),
      /public reports/i,
    );
    assert.throws(
      () =>
        verifyTelegramApplicationContract(
          withPublicPolicy('true'),
          'workspace-1',
          'false',
        ),
      /public reports/i,
    );
    for (const value of ['', 'TRUE', 'yes', undefined]) {
      assert.throws(
        () =>
          verifyTelegramApplicationContract(
            withPublicPolicy(value),
            'workspace-1',
            'true',
          ),
        /public reports/i,
      );
    }
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
                    cronTriggerSettings: JSON.stringify({
                      pattern: '0 0 * * *',
                    }),
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
  it('uses a new immutable app version for meeting and Telegram capability', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    assert.equal(packageJson.version, '1.2.23');
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
    'telegramDelivery',
    'telegramDeliveryAudit',
    'meetingBooking',
  ].map((nameSingular, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    nameSingular,
  }));
  const writable = new Set([
    'wholesaler',
    'outreachActivity',
    'telegramDelivery',
    'telegramDeliveryAudit',
    'meetingBooking',
  ]);
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

  it('uses the hydrated app resolver and joins its role by exact server-backed ID', async () => {
    const metadataSchema = buildSchema(
      await fs.readFile(
        new URL(
          '../../../../twenty-client-sdk/src/metadata/generated/schema.graphql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const documents = [
      ...verifierSource.matchAll(
        /`(query VerifyCorgiCrmInstalledApplication(?:Role)?[\s\S]*?)`/g,
      ),
    ].map(([, document]) => document);

    assert.equal(documents.length, 2);
    for (const document of documents) {
      assert.deepEqual(
        validate(metadataSchema, parse(document)).map((error) => error.message),
        [],
      );
    }
    assert.match(
      documents[0],
      /\$applicationUniversalIdentifier:\s*UUID![\s\S]*findOneApplication\s*\(\s*universalIdentifier:\s*\$applicationUniversalIdentifier\s*\)/,
    );
    assert.match(documents[0], /defaultRoleId/);
    assert.doesNotMatch(documents[0], /findManyApplications/);
    assert.doesNotMatch(documents[0], /defaultLogicFunctionRole/);
    assert.match(documents[1], /getRoles/);
    assert.match(
      verifierSource,
      /applicationUniversalIdentifier:\s*APPLICATION_ID/,
    );

    const findManyImplementation = applicationServiceSource.slice(
      applicationServiceSource.indexOf('async findManyApplications('),
      applicationServiceSource.indexOf(
        'async findManyInstalledFlatApplications(',
      ),
    );
    const findOneImplementation = applicationServiceSource.slice(
      applicationServiceSource.indexOf('async findOneApplication({'),
      applicationServiceSource.indexOf('async findOneApplicationOrThrow({'),
    );
    assert.doesNotMatch(
      findManyImplementation,
      /logicFunctionRepository|applicationVariableRepository/,
    );
    assert.match(findOneImplementation, /logicFunctionRepository\.find/);
    assert.match(findOneImplementation, /applicationVariableRepository\.find/);
    assert.match(applicationEntitySource, /defaultRoleId:\s*string \| null/);
    assert.match(applicationEntitySource, /defaultRole:\s*RoleDTO \| null/);
    assert.match(applicationDtoSource, /defaultLogicFunctionRole\?:\s*RoleDTO/);
  });

  it('reads the exact installed app and attaches only its exact role', async () => {
    const roleId = '99999999-9999-4999-8999-999999999999';
    const calls = [];
    const graphql = async (request) => {
      calls.push(request);
      if (request.operationName === 'VerifyCorgiCrmInstalledApplication') {
        return {
          currentWorkspace: { id: 'workspace-1' },
          findOneApplication: {
            universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
            version: '1.2.0',
            state: 'INSTALLED',
            defaultRoleId: roleId,
            applicationVariables: [
              { key: 'CORGI_CRM_WORKSPACE_ID', value: 'workspace-1' },
            ],
            logicFunctions: [
              {
                universalIdentifier: '65f68f6b-e130-4292-ab05-3ef48458d7de',
                databaseEventTriggerSettings: JSON.stringify({
                  eventName: 'workspaceMember.created',
                }),
              },
            ],
          },
        };
      }
      if (request.operationName === 'VerifyCorgiCrmInstalledApplicationRole') {
        return {
          currentWorkspace: { id: 'workspace-1' },
          getRoles: [{ id: 'another-role' }, { ...role, id: roleId }],
        };
      }
      throw new Error('Unexpected operation');
    };

    const application = await verifyInstalledApplication({
      graphql,
      version: '1.2.0',
      workspaceId: 'workspace-1',
    });

    assert.equal(application.defaultRoleId, roleId);
    assert.deepEqual(application.defaultLogicFunctionRole, {
      ...role,
      id: roleId,
    });
    assert.deepEqual(
      calls.map(({ operationName }) => operationName),
      [
        'VerifyCorgiCrmInstalledApplication',
        'VerifyCorgiCrmInstalledApplicationRole',
      ],
    );
    assert.deepEqual(calls[0].variables, {
      applicationUniversalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
    });
  });

  it('rejects malformed, absent, duplicate, or cross-workspace application roles', async () => {
    const roleId = '99999999-9999-4999-8999-999999999999';
    const applicationData = (defaultRoleId = roleId) => ({
      currentWorkspace: { id: 'workspace-1' },
      findOneApplication: {
        universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
        version: '1.2.0',
        state: 'INSTALLED',
        defaultRoleId,
        applicationVariables: [
          { key: 'CORGI_CRM_WORKSPACE_ID', value: 'workspace-1' },
        ],
        logicFunctions: [
          {
            universalIdentifier: '65f68f6b-e130-4292-ab05-3ef48458d7de',
            databaseEventTriggerSettings: JSON.stringify({
              eventName: 'workspaceMember.created',
            }),
          },
        ],
      },
    });
    const execute = (defaultRoleId, roleData) => {
      let call = 0;
      return verifyInstalledApplication({
        graphql: async () =>
          call++ === 0 ? applicationData(defaultRoleId) : roleData,
        version: '1.2.0',
        workspaceId: 'workspace-1',
      });
    };

    await assert.rejects(
      execute('not-a-uuid', {
        currentWorkspace: { id: 'workspace-1' },
        getRoles: [],
      }),
      /role ID is invalid/i,
    );
    await assert.rejects(
      execute(roleId, {
        currentWorkspace: { id: 'workspace-1' },
        getRoles: [],
      }),
      /exactly one.*role/i,
    );
    await assert.rejects(
      execute(roleId, {
        currentWorkspace: { id: 'workspace-1' },
        getRoles: { id: roleId },
      }),
      /exactly one.*role/i,
    );
    await assert.rejects(
      execute(roleId, {
        currentWorkspace: { id: 'workspace-1' },
        getRoles: [{ id: roleId }, { id: roleId }],
      }),
      /exactly one.*role/i,
    );
    await assert.rejects(
      execute(roleId, {
        currentWorkspace: { id: 'workspace-2' },
        getRoles: [{ id: roleId }],
      }),
      /workspace changed.*role/i,
    );
  });

  it('accepts only the exact eight-object least-privilege role', () => {
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

  it('rejects duplicate object permissions even when the count remains eight', () => {
    assert.throws(
      () =>
        verifyApplicationRoleContract(
          {
            ...role,
            objectPermissions: role.objectPermissions.map(
              (permission, index) =>
                index === 7
                  ? {
                      ...permission,
                      objectMetadataId:
                        role.objectPermissions[0].objectMetadataId,
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
      /exactly eight/i,
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

describe('installed meeting booking verification', () => {
  const field = (id, name, type, extra = {}) => ({
    id,
    name,
    type,
    isActive: true,
    ...extra,
  });
  const fieldsList = [
    field('meeting-name', 'name', 'TEXT'),
    field('meeting-time', 'scheduledAt', 'DATE_TIME'),
    field('meeting-status', 'status', 'SELECT', {
      options: [
        { value: 'DRAFT' },
        { value: 'BOOKED' },
        { value: 'COMPLETED' },
        { value: 'CANCELLED' },
        { value: 'NO_SHOW' },
      ],
    }),
    field('meeting-booked-at', 'bookedAt', 'DATE_TIME', {
      isUIEditable: false,
      writability: 'APPLICATION',
    }),
    field('meeting-notes', 'notes', 'RICH_TEXT'),
    field('meeting-validation', 'bookingValidationMessage', 'TEXT', {
      isUIEditable: false,
      writability: 'APPLICATION',
    }),
    field('meeting-company', 'company', 'RELATION', {
      relation: { targetObjectMetadata: { nameSingular: 'company' } },
    }),
    field('meeting-owner', 'wholesaler', 'RELATION', {
      relation: { targetObjectMetadata: { nameSingular: 'wholesaler' } },
    }),
    field('meeting-booker', 'bookedBy', 'RELATION', {
      isUIEditable: false,
      writability: 'APPLICATION',
      relation: { targetObjectMetadata: { nameSingular: 'workspaceMember' } },
    }),
  ];
  const object = {
    id: 'meeting-object-id',
    universalIdentifier: '0b252d63-b1de-464d-930e-1c1fb6a7eaee',
    nameSingular: 'meetingBooking',
    isActive: true,
    fieldsList,
  };
  const experience = {
    views: [
      {
        universalIdentifier: '1b8237a7-2e7a-454e-925a-68390abb2992',
        type: 'TABLE',
        objectMetadataId: object.id,
        isActive: true,
        viewFields: [],
      },
      {
        universalIdentifier: '64fbb44e-e7cf-4fd3-a3b3-44af2beb9ac9',
        type: 'CALENDAR',
        objectMetadataId: object.id,
        isActive: true,
        calendarLayout: 'MONTH',
        calendarFieldMetadataId: 'meeting-time',
        viewFields: [],
      },
      {
        universalIdentifier: '66755b49-ef0f-4f93-811e-d15a50bf0206',
        type: 'FIELDS_WIDGET',
        objectMetadataId: object.id,
        isActive: true,
        viewFields: [{ fieldMetadataId: 'meeting-validation', isActive: true }],
      },
    ],
    pageLayouts: [
      {
        universalIdentifier: 'f3af6625-cb1a-41f0-94da-4b11b6ff2ac1',
        type: 'RECORD_PAGE',
        objectMetadataId: object.id,
        tabs: [{ widgets: [{ type: 'FIELDS', isActive: true }] }],
      },
    ],
  };

  it('requires exact fields, protected evidence, relations, and native views', () => {
    assert.doesNotThrow(() => verifyMeetingBookingSchema([object], experience));
    assert.throws(
      () =>
        verifyMeetingBookingSchema(
          [
            {
              ...object,
              fieldsList: fieldsList.map((candidate) =>
                candidate.name === 'bookedAt'
                  ? { ...candidate, writability: 'OPEN' }
                  : candidate,
              ),
            },
          ],
          experience,
        ),
      /bookedAt.*writability/i,
    );
    assert.throws(
      () =>
        verifyMeetingBookingSchema([object], {
          ...experience,
          views: experience.views.filter((view) => view.type !== 'CALENDAR'),
        }),
      /calendar/i,
    );
  });

  it('requires server-valid exact status values', () => {
    assert.throws(
      () =>
        verifyMeetingBookingSchema(
          [
            {
              ...object,
              fieldsList: fieldsList.map((candidate) =>
                candidate.name === 'status'
                  ? { ...candidate, options: [{ value: 'draft' }] }
                  : candidate,
              ),
            },
          ],
          experience,
        ),
      /status options/i,
    );
  });

  it('requires booking reconciliation and alert trigger topology', () => {
    const application = {
      logicFunctions: [
        {
          universalIdentifier: 'a0b07c49-e3d1-48fa-9827-9ab9f564b1d1',
          name: 'on-meeting-booking-created',
          databaseEventTriggerSettings: { eventName: 'meetingBooking.created' },
        },
        {
          universalIdentifier: '3d425836-d5e6-4c37-9609-d9580b700c6c',
          name: 'on-meeting-booking-status-updated',
          databaseEventTriggerSettings: {
            eventName: 'meetingBooking.updated',
            updatedFields: ['status'],
          },
        },
        {
          universalIdentifier: '4d407d33-c0b2-4f8e-8300-be86c2e3dc7d',
          name: 'telegram-meeting-booked-alert',
          databaseEventTriggerSettings: {
            eventName: 'meetingBooking.updated',
            updatedFields: ['bookedAt'],
          },
        },
        {
          universalIdentifier: 'fb84094f-d44a-4180-9f50-ff7971f670e6',
          name: 'telegram-notification-delivery-worker',
          databaseEventTriggerSettings: null,
          httpRouteTriggerSettings: null,
          cronTriggerSettings: null,
        },
        {
          universalIdentifier: '8d6ea72a-aa6f-4a1c-83a7-ad539819bd47',
          name: 'verify-report-runtime',
          databaseEventTriggerSettings: null,
          httpRouteTriggerSettings: null,
          cronTriggerSettings: null,
          toolTriggerSettings: null,
          workflowActionTriggerSettings: null,
        },
      ],
    };
    assert.doesNotThrow(() => verifyMeetingApplicationContract(application));
    assert.throws(
      () =>
        verifyMeetingApplicationContract({
          logicFunctions: application.logicFunctions.filter(
            (logicFunction) =>
              logicFunction.universalIdentifier !==
              '4d407d33-c0b2-4f8e-8300-be86c2e3dc7d',
          ),
        }),
      /alert/i,
    );
    const runtimeId = '8d6ea72a-aa6f-4a1c-83a7-ad539819bd47';
    assert.throws(
      () =>
        verifyMeetingApplicationContract({
          logicFunctions: application.logicFunctions.filter(
            (logicFunction) => logicFunction.universalIdentifier !== runtimeId,
          ),
        }),
      /report runtime/i,
    );
    for (const field of [
      'databaseEventTriggerSettings',
      'httpRouteTriggerSettings',
      'cronTriggerSettings',
      'toolTriggerSettings',
      'workflowActionTriggerSettings',
    ]) {
      assert.throws(
        () =>
          verifyMeetingApplicationContract({
            logicFunctions: application.logicFunctions.map((logicFunction) =>
              logicFunction.universalIdentifier === runtimeId
                ? { ...logicFunction, [field]: {} }
                : logicFunction,
            ),
          }),
        /report runtime.*untriggered/i,
      );
    }
  });
});

describe('installed Telegram persistence schema verification', () => {
  const objectFixture = (nameSingular, fieldDefinitions, indexDefinitions) => {
    const fieldsList = fieldDefinitions.map(([name, type], index) => ({
      id: `${nameSingular}-field-${index}`,
      name,
      type,
      isActive: true,
    }));
    return {
      nameSingular,
      isActive: true,
      fieldsList,
      indexMetadataList: indexDefinitions.map((fieldNames, index) => ({
        universalIdentifier: `${nameSingular}-index-${index}`,
        isUnique: true,
        indexFieldMetadataList: fieldNames.map((fieldName, order) => ({
          fieldMetadataId: fieldsList.find((field) => field.name === fieldName)
            .id,
          order,
        })),
      })),
    };
  };
  const delivery = objectFixture(
    'telegramDelivery',
    [
      ['name', 'TEXT'],
      ['deliveryKey', 'TEXT'],
      ['operationDigest', 'TEXT'],
      ['status', 'SELECT'],
      ['stateToken', 'TEXT'],
      ['attempts', 'NUMBER'],
      ['resetCount', 'NUMBER'],
      ['unknownAt', 'DATE_TIME'],
      ['lastReasonCode', 'SELECT'],
      ['retryRequestId', 'TEXT'],
      ['approvedUnknownAt', 'DATE_TIME'],
    ],
    [['deliveryKey']],
  );
  const audit = objectFixture(
    'telegramDeliveryAudit',
    [
      ['name', 'TEXT'],
      ['requestId', 'TEXT'],
      ['deliveryKey', 'TEXT'],
      ['expectedUnknownAt', 'DATE_TIME'],
      ['actorWorkspaceMemberId', 'TEXT'],
      ['reasonDigest', 'TEXT'],
      ['requestedAt', 'DATE_TIME'],
    ],
    [['requestId'], ['deliveryKey', 'expectedUnknownAt']],
  );

  it('requires both durable objects, their field types, and all three unique indexes', () => {
    assert.doesNotThrow(() =>
      verifyTelegramPersistenceSchema([delivery, audit]),
    );
  });

  it('rejects a missing generation index or incorrect field type', () => {
    assert.throws(
      () =>
        verifyTelegramPersistenceSchema([
          delivery,
          { ...audit, indexMetadataList: audit.indexMetadataList.slice(0, 1) },
        ]),
      /unique indexes/i,
    );
    assert.throws(
      () =>
        verifyTelegramPersistenceSchema([
          {
            ...delivery,
            fieldsList: delivery.fieldsList.map((field) =>
              field.name === 'status' ? { ...field, type: 'TEXT' } : field,
            ),
          },
          audit,
        ]),
      /invalid type/i,
    );
  });
});

describe('production metadata query compatibility', () => {
  it('validates every static deployment metadata document against the generated schema', async () => {
    const [
      verifierSource,
      configurationSource,
      deploymentKeySource,
      schemaSource,
    ] = await Promise.all([
      fs.readFile(
        new URL('./verify-production-install.mjs', import.meta.url),
        'utf8',
      ),
      fs.readFile(new URL('./configure-telegram.mjs', import.meta.url), 'utf8'),
      fs.readFile(new URL('./deployment-api-key.mjs', import.meta.url), 'utf8'),
      fs.readFile(
        new URL(
          '../../../../twenty-client-sdk/src/metadata/generated/schema.graphql',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);
    const endpointDocuments = [verifierSource, configurationSource].flatMap(
      (source) =>
        [
          ...source.matchAll(
            /endpoint: '\/metadata',[\s\S]*?query: `([\s\S]*?)`,/g,
          ),
        ].map(([, document]) => document.replaceAll('${PAGE_SIZE}', '100')),
    );
    const deploymentKeyDocuments = [
      ...deploymentKeySource.matchAll(/query: `([\s\S]*?)`,/g),
    ].map(([, document]) => document);
    const documents = [...endpointDocuments, ...deploymentKeyDocuments];
    assert.equal(
      documents.length,
      18,
      'all static deployment metadata documents are covered',
    );
    const schema = buildSchema(schemaSource);

    for (const document of documents) {
      const errors = validate(schema, parse(document));
      assert.deepEqual(
        errors.map((error) => error.message),
        [],
      );
    }
  });
});

describe('meeting canary alert suppression token', () => {
  const now = Date.parse('2026-09-10T05:30:00.000Z');

  it('binds the token to the exact run and a bounded window', () => {
    const token = JSON.parse(
      buildMeetingCanarySuppression({
        runId: '34500629643',
        runAttempt: '2',
        now,
      }),
    );
    assert.deepEqual(token, {
      version: 1,
      namePrefix: 'CRM meeting canary 34500629643-2-',
      notAfter: '2026-09-10T05:50:00.000Z',
    });
  });

  it('refuses a run identity it cannot bind the token to', () => {
    for (const [runId, runAttempt] of [
      [undefined, '1'],
      ['34500629643', undefined],
      ['', '1'],
      ['0', '1'],
      ['34500629643', '0'],
      ['not-a-run', '1'],
      ['34500629643', '1 OR 1'],
    ]) {
      assert.throws(() =>
        buildMeetingCanarySuppression({ runId, runAttempt, now }),
      );
    }
  });
});
