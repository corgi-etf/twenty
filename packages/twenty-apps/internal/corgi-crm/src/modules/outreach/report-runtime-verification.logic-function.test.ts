import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';
import { describe, expect, it, vi } from 'vitest';

import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
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
const SUPPRESSION_ARMED = JSON.stringify({
  version: 1,
  namePrefix: 'CRM meeting canary 12-1-',
  notAfter: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
});
const SUPPRESSION_EXPIRED = JSON.stringify({
  version: 1,
  namePrefix: 'CRM meeting canary 12-1-',
  notAfter: new Date(NOW.getTime() - 1_000).toISOString(),
});
const SUPPRESSION_WRONG_VERSION = JSON.stringify({
  version: 2,
  namePrefix: 'CRM meeting canary 12-1-',
  notAfter: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
});
const SUPPRESSION_NO_EXPIRY = JSON.stringify({
  version: 1,
  namePrefix: 'CRM meeting canary 12-1-',
});
// Every period ends at the next 5am America/Chicago boundary after NOW.
const END = '2026-09-10T10:00:00.000Z';
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
  const request = vi.fn(
    async (
      selection: {
        operationName: string;
        document: string;
        variables: Record<string, unknown>;
      },
    ): Promise<Record<string, unknown>> => {
      if (selection.document.includes('outreachActivities(')) {
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
      if (selection.document.includes('meetingBookings(')) {
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
  // Reproduce the real app-owned generated schema: external workspace objects
  // must never be read through its locally filtered type map.
  const query = vi.fn(async () => {
    throw new Error('type Query does not have a field outreachActivities');
  });
  const mutation = vi.fn();
  const createCrmClient = vi.fn(
    () => ({ query, mutation }) as unknown as CoreApiClient,
  );
  const createRawCrmTransport = vi.fn(
    () => ({ request }) as unknown as RawCoreGraphqlTransport,
  );
  const dependencies = {
    expectedWorkspaceId: WORKSPACE_ID as string | undefined,
    enabled: 'false' as string | undefined,
    canarySuppression: undefined as string | undefined,
    timeZone: 'America/Chicago' as string | undefined,
    now: () => NOW,
    createCrmClient,
    createRawCrmTransport,
  };
  return {
    dependencies,
    request,
    query,
    mutation,
    createCrmClient,
    createRawCrmTransport,
  };
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
    const {
      dependencies,
      request,
      query,
      mutation,
      createCrmClient,
      createRawCrmTransport,
    } = fixtures();
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
          windowDays: 1,
          windowHours: 24,
          windowBoundaryLocalHour: 5,
          allOwners: true,
          activityLeaderboard: true,
          meetingsTakenByExternalWholesalers: true,
          weeklyExcludesWeekends: false,
        },
        {
          period: 'weekly',
          activityCount: 1,
          meetingCount: 1,
          windowDays: 7,
          windowHours: 168,
          windowBoundaryLocalHour: 5,
          allOwners: true,
          activityLeaderboard: true,
          meetingsTakenByExternalWholesalers: true,
          weeklyExcludesWeekends: true,
        },
        {
          period: 'monthly',
          activityCount: 3,
          meetingCount: 3,
          windowDays: 30,
          windowHours: 720,
          windowBoundaryLocalHour: 5,
          allOwners: true,
          activityLeaderboard: true,
          meetingsTakenByExternalWholesalers: true,
          weeklyExcludesWeekends: false,
        },
      ],
    });
    expect(createCrmClient).toHaveBeenCalledTimes(1);
    expect(createRawCrmTransport).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(6);
    for (const [index, start] of [
      '2026-09-09T10:00:00.000Z',
      '2026-09-03T10:00:00.000Z',
      '2026-08-11T10:00:00.000Z',
    ].entries()) {
      for (const [offset, field, timestamp] of [
        [0, 'outreachActivities', 'occurredAt'],
        [1, 'meetingBookings', 'bookedAt'],
      ] as const) {
        const selection = request.mock.calls[index * 2 + offset]![0];
        expect(selection.document).toContain(`${field}(`);
        expect(selection.variables).toEqual(
          offset === 0
            ? {
                filter: {
                  and: [
                    {
                      or: [
                        { [timestamp]: { gte: start } },
                        { createdAt: { gte: start } },
                      ],
                    },
                    {
                      or: [
                        { [timestamp]: { lt: END } },
                        { createdAt: { lt: END } },
                      ],
                    },
                  ],
                },
                first: 100,
                after: null,
              }
            : { start, end: END, first: 100, after: null },
        );
      }
    }
    expect(mutation).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /private|owner-id|11111111|22222222|33333333/i,
    );
  });

  // The ARR section is deliberately uncoupled from this gate: it fails closed
  // and deletes the live Telegram webhook, so a section built from data it
  // never reads can never take the bot down again.
  it('verifies a report whose ARR section degraded, and reads no wholesaler role data', async () => {
    const { dependencies, request } = fixtures();

    await expect(
      handleReportRuntimeVerification(payload, context, dependencies),
    ).resolves.toMatchObject({ status: 'verified' });
    for (const call of request.mock.calls)
      expect(call[0]!.document).not.toContain('wholesalers(');
    expect(request).toHaveBeenCalledTimes(6);
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
      expect(dependencies.createRawCrmTransport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing workspace binding', { expectedWorkspaceId: undefined }],
    ['empty workspace binding', { expectedWorkspaceId: '' }],
    ['invalid workspace binding', { expectedWorkspaceId: 'not-a-uuid' }],
    ['Telegram enabled', { enabled: 'true' }],
    [
      'expired canary suppression',
      { enabled: 'true', canarySuppression: SUPPRESSION_EXPIRED },
    ],
    [
      'canary suppression of an unknown version',
      { enabled: 'true', canarySuppression: SUPPRESSION_WRONG_VERSION },
    ],
    [
      'canary suppression without an expiry',
      { enabled: 'true', canarySuppression: SUPPRESSION_NO_EXPIRY },
    ],
    [
      'unparseable canary suppression',
      { enabled: 'true', canarySuppression: 'not-json' },
    ],
    [
      'armed canary suppression read through an unusable clock',
      {
        enabled: 'true',
        canarySuppression: SUPPRESSION_ARMED,
        now: () => new Date('invalid'),
      },
    ],
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
      expect(dependencies.createRawCrmTransport).not.toHaveBeenCalled();
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
      expect(dependencies.createRawCrmTransport).not.toHaveBeenCalled();
    },
  );

  it('accepts genuine empty connections only as zero-count reports for every period', async () => {
    const { dependencies, request, query, mutation } = fixtures();
    request.mockImplementation(async () => ({
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
    expect(request).toHaveBeenCalledTimes(6);
    expect(query).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  // The release installs before the canary runs but disables Telegram after
  // it, so this is the state every real canary run is actually in.
  it('verifies while Telegram is still live if canary suppression is armed', async () => {
    const { dependencies, createCrmClient } = fixtures();
    const result = await handleReportRuntimeVerification(payload, context, {
      ...dependencies,
      enabled: 'true',
      canarySuppression: SUPPRESSION_ARMED,
    });
    expect(result.status).toBe('verified');
    expect(result.reports).toHaveLength(3);
    expect(createCrmClient).toHaveBeenCalled();
  });

  it('sanitizes client-construction failures without attempting any read', async () => {
    const { dependencies, request, query, mutation } = fixtures();
    dependencies.createCrmClient.mockImplementation(() => {
      throw new Error('Private credential must not escape');
    });
    await expect(
      handleReportRuntimeVerification(payload, context, dependencies),
    ).rejects.toThrow('Report runtime client initialization failed');
    expect(query).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(dependencies.createRawCrmTransport).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'fails the entire verification if period %i cannot read real schema',
    async (period) => {
      const { dependencies, request, query, mutation } = fixtures();
      const implementation = request.getMockImplementation()!;
      let call = 0;
      request.mockImplementation(async (selection) => {
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
      expect(request).toHaveBeenCalledTimes((period + 1) * 2);
      expect(query).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
    },
  );

  it('sanitizes raw transport construction failures without attempting reads', async () => {
    const { dependencies, request, query, mutation } = fixtures();
    dependencies.createRawCrmTransport.mockImplementation(() => {
      throw new Error('Private runtime credential must not escape');
    });
    await expect(
      handleReportRuntimeVerification(payload, context, dependencies),
    ).rejects.toThrow('Report runtime client initialization failed');
    expect(request).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });
});
