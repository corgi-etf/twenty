import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const configurationModule = await import('./configure-telegram.mjs').catch(
  () => ({}),
);

describe('trusted Telegram application configuration', () => {
  it('allows initial activation with no linked users and no private report access', () => {
    const variables = configurationModule.validateTrustedTelegramConfiguration({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      token: 'token',
      webhookSecret: 'secret',
      operatorSecret: 'operator-secret',
      linkCodesJson: '{"bindings":[]}',
      notificationRoutesJson: '',
      timeZone: 'America/Chicago',
      dailySummaryTime: '18:00',
    });
    assert.equal(variables.CORGI_CRM_TELEGRAM_LINK_CODES, '{"bindings":[]}');
    assert.equal(variables.CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES, '{}');
  });

  it('actively disables without requiring provider secrets', async () => {
    const writes = [];
    await configurationModule.configureTelegramApplication({
      graphql: async ({ operationName, variables }) => {
        if (operationName === 'FindCorgiCrmApplication') {
          return {
            findManyApplications: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
              },
            ],
          };
        }
        writes.push(variables);
        return { updateOneApplicationVariable: true };
      },
      workspaceId: '11111111-1111-4111-8111-111111111111',
      enabled: false,
    });
    assert.deepEqual(writes, [
      {
        applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        key: 'CORGI_CRM_TELEGRAM_ENABLED',
        value: 'false',
      },
      {
        applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        key: 'CORGI_CRM_WORKSPACE_ID',
        value: '11111111-1111-4111-8111-111111111111',
      },
    ]);
  });

  it('treats a proven absent app as already disabled without hiding invalid results', async () => {
    const noApplication =
      await configurationModule.configureTelegramApplication({
        graphql: async () => ({ findManyApplications: [] }),
        workspaceId: '11111111-1111-4111-8111-111111111111',
        enabled: false,
      });
    assert.deepEqual(noApplication, { status: 'already-disabled' });

    const duplicate = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
    };
    await assert.rejects(
      () =>
        configurationModule.configureTelegramApplication({
          graphql: async () => ({
            findManyApplications: [duplicate, duplicate],
          }),
          workspaceId: '11111111-1111-4111-8111-111111111111',
          enabled: false,
        }),
      /found 2/i,
    );
    await assert.rejects(
      () =>
        configurationModule.configureTelegramApplication({
          graphql: async () => ({ findManyApplications: null }),
          workspaceId: '11111111-1111-4111-8111-111111111111',
          enabled: false,
        }),
      /invalid/i,
    );
  });

  it('requires an exact true application-variable mutation result', async () => {
    for (const mutationResult of [false, null, undefined]) {
      await assert.rejects(
        () =>
          configurationModule.configureTelegramApplication({
            graphql: async ({ operationName }) =>
              operationName === 'FindCorgiCrmApplication'
                ? {
                    findManyApplications: [
                      {
                        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                        universalIdentifier:
                          'ca87ad48-b62a-41be-a790-7c17707ff1b4',
                      },
                    ],
                  }
                : mutationResult === undefined
                  ? undefined
                  : { updateOneApplicationVariable: mutationResult },
            workspaceId: '11111111-1111-4111-8111-111111111111',
            enabled: false,
          }),
        /was not updated/i,
      );
    }
  });

  it('validates the complete trusted configuration before the first mutation', async () => {
    assert.equal(
      typeof configurationModule.configureTelegramApplication,
      'function',
      'configureTelegramApplication must be implemented',
    );
    const mutations = [];
    const graphql = async ({ operationName, variables }) => {
      if (operationName === 'FindCorgiCrmApplication') {
        return {
          findManyApplications: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
            },
          ],
        };
      }
      mutations.push(variables);
      return { updateOneApplicationVariable: true };
    };

    await assert.rejects(
      () =>
        configurationModule.configureTelegramApplication({
          graphql,
          workspaceId: '11111111-1111-4111-8111-111111111111',
          token: 'token',
          webhookSecret: 'secret',
          operatorSecret: 'operator-secret',
          linkCodesJson: '{not-json',
          notificationRoutesJson: '{}',
          timeZone: 'America/Chicago',
          dailySummaryTime: '17:00',
          enabled: true,
        }),
      /json/i,
    );
    assert.equal(mutations.length, 0);
  });

  it('stages every trusted value while the application remains disabled', async () => {
    assert.equal(
      typeof configurationModule.validateTrustedTelegramConfiguration,
      'function',
      'validateTrustedTelegramConfiguration must be implemented',
    );
    const duplicateUser = JSON.stringify({
      bindings: [
        {
          code: 'one',
          workspaceMemberId: '11111111-1111-4111-8111-111111111111',
          telegramUserId: '101',
        },
        {
          code: 'two',
          workspaceMemberId: '22222222-2222-4222-8222-222222222222',
          telegramUserId: '101',
        },
      ],
    });
    assert.throws(
      () =>
        configurationModule.validateTrustedTelegramConfiguration({
          workspaceId: '11111111-1111-4111-8111-111111111111',
          token: 'token',
          webhookSecret: 'secret',
          operatorSecret: 'operator-secret',
          linkCodesJson: duplicateUser,
          notificationRoutesJson: '{}',
          timeZone: 'America/Chicago',
          dailySummaryTime: '17:00',
        }),
      /duplicate/i,
    );

    const writes = [];
    await configurationModule.configureTelegramApplication({
      graphql: async ({ operationName, variables }) => {
        if (operationName === 'FindCorgiCrmApplication') {
          return {
            findManyApplications: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                universalIdentifier: 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
              },
            ],
          };
        }
        writes.push(variables);
        return { updateOneApplicationVariable: true };
      },
      workspaceId: '11111111-1111-4111-8111-111111111111',
      token: 'token',
      webhookSecret: 'secret',
      operatorSecret: 'operator-secret',
      linkCodesJson: JSON.stringify({
        bindings: [
          {
            code: 'one',
            workspaceMemberId: '11111111-1111-4111-8111-111111111111',
            telegramUserId: '101',
          },
        ],
      }),
      notificationRoutesJson: JSON.stringify({
        version: 1,
        routes: [
          {
            event: 'meeting_booked',
            chatId: '-100123',
            messageThreadId: 42,
          },
        ],
      }),
      timeZone: 'America/Chicago',
      dailySummaryTime: '17:00',
      enabled: false,
      stage: true,
    });
    assert.deepEqual(writes[0], {
      applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      key: 'CORGI_CRM_TELEGRAM_ENABLED',
      value: 'false',
    });
    assert.deepEqual(
      writes
        .slice(1)
        .map(({ key }) => key)
        .sort(),
      [
        'CORGI_CRM_TELEGRAM_BOT_TOKEN',
        'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME',
        'CORGI_CRM_TELEGRAM_LINK_CODES',
        'CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES',
        'CORGI_CRM_TELEGRAM_OPERATOR_SECRET',
        'CORGI_CRM_TELEGRAM_TIME_ZONE',
        'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET',
        'CORGI_CRM_WORKSPACE_ID',
      ].sort(),
    );
    assert.equal(
      writes.some(
        ({ key, value }) =>
          key === 'CORGI_CRM_TELEGRAM_ENABLED' && value === 'true',
      ),
      false,
    );
  });

  it('rejects an invalid or duplicate notification destination before writes', async () => {
    for (const notificationRoutesJson of [
      '{"version":1,"routes":[{"event":"other","chatId":"-1001"}]}',
      '{"version":1,"routes":[{"event":"meeting_booked","chatId":"-1001","messageThreadId":0}]}',
      '{"version":1,"routes":[{"event":"meeting_booked","chatId":"-1001"},{"event":"meeting_booked","chatId":"-1001"}]}',
    ]) {
      const graphql = async () => {
        throw new Error('must not query before validation');
      };
      await assert.rejects(
        () =>
          configurationModule.configureTelegramApplication({
            graphql,
            workspaceId: '11111111-1111-4111-8111-111111111111',
            token: 'token',
            webhookSecret: 'secret',
            operatorSecret: 'operator-secret',
            linkCodesJson: '{"bindings":[]}',
            notificationRoutesJson,
            timeZone: 'America/Chicago',
            dailySummaryTime: '17:00',
            enabled: true,
          }),
        /notification route/i,
      );
    }
  });
});
