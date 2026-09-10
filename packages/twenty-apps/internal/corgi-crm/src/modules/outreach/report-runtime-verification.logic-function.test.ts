import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';
import { describe, expect, it, vi } from 'vitest';

import runtimeFunction, {
  handleReportRuntimeVerification,
  REPORT_RUNTIME_VERIFICATION_CONFIRMATION,
  REPORT_RUNTIME_VERIFICATION_IDENTIFIER,
} from 'src/modules/outreach/report-runtime-verification.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-09T16:30:00.000Z');
const context: LogicFunctionExecutionContext = {
  workspaceId: WORKSPACE_ID,
  userWorkspaceId: USER_WORKSPACE_ID,
  workspaceMemberId: WORKSPACE_MEMBER_ID,
  retryCount: 0,
  maxRetries: 0,
};
const payload = {
  confirmation: REPORT_RUNTIME_VERIFICATION_CONFIRMATION,
  expectedUserWorkspaceId: USER_WORKSPACE_ID,
  expectedWorkspaceMemberId: WORKSPACE_MEMBER_ID,
};

const fixtures = () => {
  const timestamps = [
    '2026-09-09T15:00:00.000Z',
    '2026-09-06T15:00:00.000Z',
    '2026-08-31T15:00:00.000Z',
  ];
  const query = vi.fn(
    async (
      selection: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      if ('outreachActivities' in selection) {
        return {
          outreachActivities: {
            edges: timestamps.map((occurredAt, index) => ({
              node: {
                id: `activity-${index}`,
                occurredAt,
                activityType: 'phone_call',
                outcome: 'connected',
                notes: 'Private notes must not leave the runtime',
                company: { name: 'Private company' },
                contact: {
                  name: { firstName: 'Private', lastName: 'Contact' },
                },
                wholesalerId: 'private-owner-id',
                wholesaler: { id: 'private-owner-id', name: 'Private owner' },
              },
            })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      if ('meetingBookings' in selection) {
        return {
          meetingBookings: {
            edges: timestamps.map((bookedAt, index) => ({
              node: {
                id: `booking-${index}`,
                bookedAt,
                scheduledAt: '2026-10-01T15:00:00.000Z',
                wholesalerId: 'private-owner-id',
                wholesaler: { id: 'private-owner-id', name: 'Private owner' },
              },
            })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      throw new Error('Unexpected runtime verification query');
    },
  );
  const mutation = vi.fn();
  const createCrmClient = vi.fn(
    () => ({ query, mutation }) as unknown as CoreApiClient,
  );
  const dependencies = {
    expectedWorkspaceId: WORKSPACE_ID as string | undefined,
    enabled: 'false' as string | undefined,
    timeZone: 'America/Chicago' as string | undefined,
    now: () => NOW,
    createCrmClient,
  };
  return { dependencies, query, mutation, createCrmClient };
};

describe('internal read-only production report verification', () => {
  it('has a stable identity and no automatic, HTTP, tool, or workflow triggers', () => {
    expect(runtimeFunction.success).toBe(true);
    expect(runtimeFunction.config.universalIdentifier).toBe(
      REPORT_RUNTIME_VERIFICATION_IDENTIFIER,
    );
    expect(runtimeFunction.config.name).toBe('verify-report-runtime');
    for (const key of [
      'databaseEventTriggerSettings',
      'httpRouteTriggerSettings',
      'cronTriggerSettings',
      'toolTriggerSettings',
      'workflowActionTriggerSettings',
    ])
      expect(runtimeFunction.config).not.toHaveProperty(key);
  });

  it('runs all three real repository and summary paths, returning safe evidence only', async () => {
    const { dependencies, query, mutation, createCrmClient } = fixtures();
    const result = await handleReportRuntimeVerification(
      payload,
      context,
      dependencies,
    );
    expect(result).toEqual({
      status: 'verified',
      reports: [
        {
          period: 'daily',
          activityCount: 1,
          meetingCount: 1,
          windowHours: 24,
          allOwners: true,
          activityLeaderboard: true,
          meetingLeaderboard: true,
          weeklyExcludesWeekends: false,
        },
        {
          period: 'weekly',
          activityCount: 1,
          meetingCount: 1,
          windowHours: 168,
          allOwners: true,
          activityLeaderboard: true,
          meetingLeaderboard: true,
          weeklyExcludesWeekends: true,
        },
        {
          period: 'monthly',
          activityCount: 3,
          meetingCount: 3,
          windowHours: 720,
          allOwners: true,
          activityLeaderboard: true,
          meetingLeaderboard: true,
          weeklyExcludesWeekends: false,
        },
      ],
    });
    expect(createCrmClient).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(6);
    for (const [index, start] of [
      '2026-09-08T16:30:00.000Z',
      '2026-09-02T16:30:00.000Z',
      '2026-08-10T16:30:00.000Z',
    ].entries()) {
      for (const [offset, field, timestamp] of [
        [0, 'outreachActivities', 'occurredAt'],
        [1, 'meetingBookings', 'bookedAt'],
      ] as const) {
        const selection = query.mock.calls[index * 2 + offset]![0];
        expect(selection).toMatchObject({
          [field]: {
            __args: {
              filter: {
                and: [
                  { [timestamp]: { gte: start } },
                  { [timestamp]: { lt: NOW.toISOString() } },
                ],
              },
            },
          },
        });
      }
    }
    expect(mutation).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /private|owner-id|11111111|22222222|33333333/i,
    );
  });

  it.each([
    ['missing context', undefined],
    ['different workspace', { ...context, workspaceId: OTHER_ID }],
    ['missing user workspace', { ...context, userWorkspaceId: null }],
    ['missing workspace member', { ...context, workspaceMemberId: null }],
    ['different user workspace', { ...context, userWorkspaceId: OTHER_ID }],
    ['different workspace member', { ...context, workspaceMemberId: OTHER_ID }],
  ] as const)(
    'denies %s before client construction',
    async (_name, executionContext) => {
      const { dependencies, createCrmClient } = fixtures();
      await expect(
        handleReportRuntimeVerification(
          payload,
          executionContext,
          dependencies,
        ),
      ).rejects.toThrow('Report runtime verification denied');
      expect(createCrmClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing workspace binding', { expectedWorkspaceId: undefined }],
    ['empty workspace binding', { expectedWorkspaceId: '' }],
    ['invalid workspace binding', { expectedWorkspaceId: 'not-a-uuid' }],
    ['Telegram enabled', { enabled: 'true' }],
    ['missing delivery gate', { enabled: undefined }],
    ['ambiguous delivery gate', { enabled: 'FALSE' }],
    ['missing time zone', { timeZone: undefined }],
    ['invalid time zone', { timeZone: 'Not/AZone' }],
    ['invalid clock', { now: () => new Date('invalid') }],
  ] as const)(
    'denies %s before client construction',
    async (_name, overrides) => {
      const { dependencies, createCrmClient } = fixtures();
      await expect(
        handleReportRuntimeVerification(payload, context, {
          ...dependencies,
          ...overrides,
        }),
      ).rejects.toThrow('Report runtime verification denied');
      expect(createCrmClient).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      undefined,
      null,
      [],
      {},
      { ...payload, confirmation: 'wrong' },
      { ...payload, expectedUserWorkspaceId: 'invalid' },
      { ...payload, expectedWorkspaceMemberId: 'invalid' },
      { ...payload, period: 'daily' },
      { ...payload, workspaceId: WORKSPACE_ID },
      { ...payload, telegramUserId: '123' },
    ].map((input) => ({ input })),
  )(
    'denies malformed or expanded payload %j before client construction',
    async ({ input }) => {
      const { dependencies, createCrmClient } = fixtures();
      await expect(
        handleReportRuntimeVerification(input, context, dependencies),
      ).rejects.toThrow('Report runtime verification denied');
      expect(createCrmClient).not.toHaveBeenCalled();
    },
  );

  it('accepts genuine empty connections only as zero-count reports for every period', async () => {
    const { dependencies, query, mutation } = fixtures();
    query.mockImplementation(async () => ({
      outreachActivities: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      meetingBookings: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }));
    const result = await handleReportRuntimeVerification(
      payload,
      context,
      dependencies,
    );
    expect(result.status).toBe('verified');
    expect(
      result.reports.map(({ activityCount, meetingCount }) => [
        activityCount,
        meetingCount,
      ]),
    ).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(query).toHaveBeenCalledTimes(6);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('sanitizes client-construction failures without attempting any read', async () => {
    const { dependencies, query, mutation } = fixtures();
    dependencies.createCrmClient.mockImplementation(() => {
      throw new Error('Private credential must not escape');
    });
    await expect(
      handleReportRuntimeVerification(payload, context, dependencies),
    ).rejects.toThrow('Report runtime client initialization failed');
    expect(query).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'fails the entire verification if period %i cannot read real schema',
    async (period) => {
      const { dependencies, query, mutation } = fixtures();
      const implementation = query.getMockImplementation()!;
      let call = 0;
      query.mockImplementation(async (selection) => {
        const currentCall = call++;
        if (currentCall === period * 2 + 1)
          throw new Error('Private schema payload must not escape');
        return implementation(selection);
      });
      await expect(
        handleReportRuntimeVerification(payload, context, dependencies),
      ).rejects.toThrow(
        `Report runtime verification failed for ${['daily', 'weekly', 'monthly'][period]}`,
      );
      expect(query).toHaveBeenCalledTimes((period + 1) * 2);
      expect(mutation).not.toHaveBeenCalled();
    },
  );
});
