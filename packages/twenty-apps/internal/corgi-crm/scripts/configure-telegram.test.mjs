import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const configurationModule = await import('./configure-telegram.mjs').catch(
  () => ({}),
);

describe('trusted Telegram application configuration', () => {
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
      return { updateOneApplicationVariable: { key: variables.key } };
    };

    await assert.rejects(
      () =>
        configurationModule.configureTelegramApplication({
          graphql,
          workspaceId: '11111111-1111-4111-8111-111111111111',
          token: 'token',
          webhookSecret: 'secret',
          linkCodesJson: '{not-json',
          timeZone: 'America/Chicago',
          dailySummaryTime: '17:00',
          enabled: false,
        }),
      /json/i,
    );
    assert.equal(mutations.length, 0);
  });

  it('rejects duplicate user/member bindings and writes disabled state first', async () => {
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
          linkCodesJson: duplicateUser,
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
        return { updateOneApplicationVariable: { key: variables.key } };
      },
      workspaceId: '11111111-1111-4111-8111-111111111111',
      token: 'token',
      webhookSecret: 'secret',
      linkCodesJson: JSON.stringify({
        bindings: [
          {
            code: 'one',
            workspaceMemberId: '11111111-1111-4111-8111-111111111111',
            telegramUserId: '101',
          },
        ],
      }),
      timeZone: 'America/Chicago',
      dailySummaryTime: '17:00',
      enabled: false,
    });
    assert.deepEqual(writes[0], {
      applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      key: 'CORGI_CRM_TELEGRAM_ENABLED',
      value: 'false',
    });
  });
});
