import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreMeetingBookingReportRepository } from 'src/modules/outreach/graphql/core-meeting-booking-report.repository';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import {
  getReportWindow,
  readReportSummary,
  type ReportPeriod,
} from 'src/modules/outreach/services/report-summary.service';

type VerificationDependencies = {
  expectedWorkspaceId: string | undefined;
  enabled: string | undefined;
  timeZone: string | undefined;
  now(): Date;
  createCrmClient(): CoreApiClient;
  createRawCrmTransport(): RawCoreGraphqlTransport;
};

export const REPORT_RUNTIME_VERIFICATION_IDENTIFIER =
  '8d6ea72a-aa6f-4a1c-83a7-ad539819bd47';
export const REPORT_RUNTIME_VERIFICATION_CONFIRMATION =
  'VERIFY_CORGI_CRM_REPORT_RUNTIME_WITH_TELEGRAM_DISABLED';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);
const EXPECTED_TITLES: Record<ReportPeriod, string> = {
  daily: '🎉 Daily outreach report',
  weekly: '🎉 Weekly outreach report — excluding Saturday/Sunday',
  monthly: '🎉 Monthly outreach report',
};
const EXPECTED_SECTIONS = [
  'All CRM owners',
  '🏆 Activity leaderboard (calls/emails/linkedin)',
  'Meetings taken by EW',
];
// The report window is a whole number of 5am-to-5am local days, which is 23 or
// 25 hours long across a daylight saving transition rather than exactly 24.
const REPORT_WINDOW_BOUNDARY_HOUR = 5;
const localHour = (instant: Date, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
    }).format(instant),
  );
const PAYLOAD_KEYS = [
  'confirmation',
  'expectedUserWorkspaceId',
  'expectedWorkspaceMemberId',
];

const readCount = (lines: string[], prefix: string) => {
  const values = lines.filter((line) => line.startsWith(prefix));
  const value = values[0]?.slice(prefix.length);
  if (values.length !== 1 || !value || !/^\d+$/.test(value)) {
    throw new Error('Report count is unavailable');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error('Report count is invalid');
  return count;
};

export const handleReportRuntimeVerification = async (
  payload: unknown,
  context: LogicFunctionExecutionContext | undefined,
  dependencies: VerificationDependencies,
) => {
  const input =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  if (
    !isUuid(dependencies.expectedWorkspaceId) ||
    context?.workspaceId !== dependencies.expectedWorkspaceId ||
    !isUuid(context.userWorkspaceId) ||
    !isUuid(context.workspaceMemberId) ||
    dependencies.enabled !== 'false' ||
    !input ||
    Object.keys(input).length !== PAYLOAD_KEYS.length ||
    !PAYLOAD_KEYS.every((key) =>
      Object.prototype.hasOwnProperty.call(input, key),
    ) ||
    input.confirmation !== REPORT_RUNTIME_VERIFICATION_CONFIRMATION ||
    input.expectedUserWorkspaceId !== context.userWorkspaceId ||
    input.expectedWorkspaceMemberId !== context.workspaceMemberId ||
    !dependencies.timeZone
  ) {
    throw new Error('Report runtime verification denied');
  }
  let now: Date;
  try {
    now = dependencies.now();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid clock');
    new Intl.DateTimeFormat('en-US', {
      timeZone: dependencies.timeZone,
    }).format(now);
  } catch {
    throw new Error('Report runtime verification denied');
  }

  // Both transports retain the server-injected identity. Payload identities
  // are expectations, never an alternate actor or an authorization override.
  let client: CoreApiClient;
  let rawTransport: RawCoreGraphqlTransport;
  try {
    client = dependencies.createCrmClient();
    rawTransport = dependencies.createRawCrmTransport();
  } catch {
    throw new Error('Report runtime client initialization failed');
  }
  const repository = new CoreOutreachRepository(client, rawTransport);
  const meetingRepository = new CoreMeetingBookingReportRepository(rawTransport);
  const reports = [];
  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    try {
      // No wholesalerRoleReader on purpose. This gate runs with Telegram
      // disabled and deletes the live webhook when it fails, so it reads
      // exactly what it asserts on and nothing more: with no role data the
      // leaderboard stays ungrouped and both EW sections render their
      // unavailable line, none of which the assertions below depend on.
      const report = await readReportSummary({
        repository,
        meetingRepository,
        period,
        now,
        timeZone: dependencies.timeZone,
      });
      const lines = report.split('\n');
      if (
        lines[0] !== EXPECTED_TITLES[period] ||
        !EXPECTED_SECTIONS.every((section) => lines.includes(section))
      ) {
        throw new Error('Report sections are unavailable');
      }
      const timeZone = dependencies.timeZone;
      const { start, end } = getReportWindow({ period, now, timeZone });
      const windowHours = (end.getTime() - start.getTime()) / 3_600_000;
      const windowDays = Math.round(windowHours / 24);
      const windowBoundaryLocalHour = localHour(start, timeZone);
      if (
        windowDays < 1 ||
        Math.abs(windowHours - windowDays * 24) > 1 ||
        windowBoundaryLocalHour !== REPORT_WINDOW_BOUNDARY_HOUR ||
        localHour(end, timeZone) !== REPORT_WINDOW_BOUNDARY_HOUR
      ) {
        throw new Error('Report window is not whole local reporting days');
      }
      reports.push({
        period,
        activityCount: readCount(lines, '📊 Total activities: '),
        meetingCount: readCount(lines, '📅 Meetings set: '),
        windowDays,
        windowHours,
        windowBoundaryLocalHour,
        allOwners: true,
        activityLeaderboard: true,
        meetingsTakenByExternalWholesalers: true,
        weeklyExcludesWeekends: period === 'weekly',
      });
    } catch {
      // Never return report text, record identifiers, or SDK/schema error data.
      throw new Error(`Report runtime verification failed for ${period}`);
    }
  }
  return { status: 'verified', reports } as const;
};

export const handler = async (
  payload: unknown,
  context?: LogicFunctionExecutionContext,
) =>
  handleReportRuntimeVerification(payload, context, {
    expectedWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID,
    enabled: process.env.CORGI_CRM_TELEGRAM_ENABLED,
    timeZone: process.env.CORGI_CRM_TELEGRAM_TIME_ZONE,
    now: () => new Date(),
    createCrmClient: () => new CoreApiClient(),
    createRawCrmTransport: () => new RawCoreGraphqlTransport(),
  });

export default defineLogicFunction({
  universalIdentifier: REPORT_RUNTIME_VERIFICATION_IDENTIFIER,
  name: 'verify-report-runtime',
  description:
    'Internal disabled-release verification of the installed read-only report runtime. No triggers or Telegram delivery.',
  timeoutSeconds: 60,
  handler,
});
