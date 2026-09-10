import { expect, test, type Route } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { assertWorkspaceConfigTenant } from '../../../corgi-crm-workspace-config/src/twenty-api.ts';
import {
  MEETING_CANARY_ACTOR_IDENTITY_QUERY,
  MEETING_CANARY_MEMBERS_QUERY,
  resolveMeetingCanaryActor,
} from './meetingBookingCanaryPreflight';
import { requireProductionEnvironment } from './requireProductionEnvironment';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPLICATION_IDENTIFIER = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
const REPORT_RUNTIME_IDENTIFIER = '8d6ea72a-aa6f-4a1c-83a7-ad539819bd47';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Meeting = {
  id: string;
  name: string | null;
  createdAt: string;
  createdBy: { workspaceMemberId: string | null };
  companyId: string | null;
  wholesalerId: string | null;
  scheduledAt: string | null;
  status: string;
  bookedAt: string | null;
  bookedById: string | null;
  bookingValidationMessage: string | null;
};

type ExistingRecord = { id: string; name: string };
type Connection<TRecord> = { edges: Array<{ node: TRecord }> };

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the meeting canary`);
  return value;
};

// Routine smoke runs must never create meetings or produce booking events.
test.skip(
  process.env.CRM_MEETING_CANARY_ENABLED === undefined,
  'Meeting creation is available only through the protected app-install workflow.',
);
test.describe.configure({ retries: 0 });
test.use({ screenshot: 'off', trace: 'off', video: 'off', timezoneId: 'UTC' });

test.beforeAll(async () => {
  expect(requiredEnvironment('CRM_MEETING_CANARY_ENABLED')).toBe('true');
  expect(requiredEnvironment('CRM_MEETING_CANARY_CONFIRMATION')).toBe(
    'VERIFY_NATIVE_CRM_MEETING_WITH_TELEGRAM_DISABLED',
  );
  expect(requiredEnvironment('GITHUB_ACTIONS')).toBe('true');
  expect(requiredEnvironment('GITHUB_EVENT_NAME')).toBe('workflow_dispatch');
  expect(requiredEnvironment('GITHUB_REF')).toBe('refs/heads/main');
  expect(requiredEnvironment('GITHUB_WORKFLOW_REF')).toBe(
    `${requiredEnvironment('GITHUB_REPOSITORY')}/.github/workflows/corgi-crm-app-production.yml@refs/heads/main`,
  );
  expect(['publish-and-install', 'configure-telegram']).toContain(
    requiredEnvironment('CRM_MEETING_CANARY_OPERATION'),
  );
  const deployedSha = requiredEnvironment('CRM_DEPLOYED_SHA');
  const workflowSha = requiredEnvironment('GITHUB_SHA');
  expect(deployedSha).toMatch(/^[0-9a-f]{40}$/);
  expect(workflowSha).toMatch(/^[0-9a-f]{40}$/);
  expect(requiredEnvironment('PLAYWRIGHT_NO_COPY_PROMPT')).toBe('1');
  const { FRONTEND_BASE_URL, BACKEND_BASE_URL } =
    requireProductionEnvironment();
  expect(new URL(FRONTEND_BASE_URL).origin).toBe(APPROVED_ORIGIN);
  expect(new URL(BACKEND_BASE_URL).origin).toBe(APPROVED_ORIGIN);
  const repositoryRoot = resolve(__dirname, '../../../..');
  try {
    // Re-prove source equivalence; a workflow flag cannot authorize native writes.
    await promisify(execFile)(
      process.execPath,
      [
        resolve(
          repositoryRoot,
          'packages/twenty-apps/internal/corgi-crm/scripts/deployment-revision-guard.mjs',
        ),
        deployedSha,
        workflowSha,
      ],
      {
        cwd: repositoryRoot,
        env: { PATH: process.env.PATH },
        shell: false,
        timeout: 15_000,
        maxBuffer: 64 * 1024,
      },
    );
  } catch {
    throw new Error(
      'Meeting canary failed during deployment revision preflight',
    );
  }
});

test('books and reschedules a native CRM meeting while Telegram is disabled', async ({
  page,
}) => {
  test.setTimeout(6 * 60_000);
  let phase = 'authenticated tenant permission preflight';
  let meetingId: string | undefined;
  let initialName: string | null | undefined;
  let named = false;
  let creationRequestedAt = 0;
  let workspaceMemberId: string | undefined;
  let cleanupVerified = false;
  let failure: Error | undefined;
  const request = page.request;
  const meetingName = `CRM meeting canary ${requiredEnvironment('GITHUB_RUN_ID')}-${requiredEnvironment('GITHUB_RUN_ATTEMPT')}-${randomUUID()}`;

  const graphql = async <TData>(
    endpoint: '/metadata' | '/graphql',
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {},
    timeout = 15_000,
  ): Promise<TData> => {
    const response = await request.post(
      new URL(endpoint, APPROVED_ORIGIN).href,
      {
        headers: { Origin: APPROVED_ORIGIN },
        data: { operationName, query, variables },
        timeout,
      },
    );
    try {
      if (!response.ok()) {
        throw new Error(
          `${operationName} failed with HTTP ${response.status()}`,
        );
      }
      const body = (await response.json()) as {
        data?: TData;
        errors?: unknown;
      };
      if (
        (Array.isArray(body.errors)
          ? body.errors.length > 0
          : Boolean(body.errors)) ||
        !body.data
      ) {
        throw new Error(`${operationName} returned GraphQL errors or no data`);
      }
      return body.data;
    } finally {
      await response.dispose();
    }
  };

  const assertDisabled = async () => {
    const result = await graphql<{
      currentWorkspace: { id: string };
      findOneApplication: {
        id: string;
        universalIdentifier: string;
        version: string;
        applicationVariables: Array<{ key: string; value: string }>;
      } | null;
    }>(
      '/metadata',
      'MeetingCanaryDeliveryGate',
      `
        query MeetingCanaryDeliveryGate($universalIdentifier: UUID!) {
          currentWorkspace {
            id
          }
          findOneApplication(universalIdentifier: $universalIdentifier) {
            id
            universalIdentifier
            version
            applicationVariables {
              key
              value
            }
          }
        }
      `,
      { universalIdentifier: APPLICATION_IDENTIFIER },
    );
    const expectedWorkspaceId = requiredEnvironment(
      'CORGI_CRM_EXPECTED_WORKSPACE_ID',
    );
    expect(result.currentWorkspace.id === expectedWorkspaceId).toBe(true);
    const application = result.findOneApplication;
    if (!application) {
      throw new Error('Installed meeting application was not found');
    }
    expect(application.universalIdentifier === APPLICATION_IDENTIFIER).toBe(
      true,
    );
    expect(UUID_PATTERN.test(application.id)).toBe(true);
    expect(
      application.version === requiredEnvironment('CORGI_CRM_EXPECTED_VERSION'),
    ).toBe(true);
    for (const [key, value] of [
      ['CORGI_CRM_WORKSPACE_ID', expectedWorkspaceId],
      ['CORGI_CRM_TELEGRAM_ENABLED', 'false'],
    ]) {
      const matches = application.applicationVariables.filter(
        (variable) => variable.key === key,
      );
      expect(matches.length === 1 && matches[0]?.value === value).toBe(true);
    }
    return application.id;
  };

  const readMeeting = async (): Promise<Meeting | null> => {
    if (!meetingId || !UUID_PATTERN.test(meetingId)) {
      throw new Error('No exact native meeting creation ID was captured');
    }
    const result = await graphql<{ meetingBooking: Meeting | null }>(
      '/graphql',
      'ReadRunOwnedMeetingCanary',
      `
        query ReadRunOwnedMeetingCanary($id: UUID!) {
          meetingBooking(
            filter: {
              id: { eq: $id }
              or: [{ deletedAt: { is: NULL } }, { deletedAt: { is: NOT_NULL } }]
            }
          ) {
            id
            name
            createdAt
            createdBy {
              workspaceMemberId
            }
            companyId
            wholesalerId
            scheduledAt
            status
            bookedAt
            bookedById
            bookingValidationMessage
          }
        }
      `,
      { id: meetingId },
    );
    return result.meetingBooking;
  };

  const guardNativeMutation = async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    const body = request.postDataJSON() as {
      operationName?: string;
      query?: string;
      variables?: {
        idToUpdate?: string;
        input?: { id?: string; name?: string | null };
      };
    };
    if (!body.query) return route.abort('blockedbyclient');
    if (!/\bmutation\b/.test(body.query)) return route.continue();
    try {
      await assertDisabled();
      if (body.operationName === 'CreateOneMeetingBooking') {
        const id = body.variables?.input?.id;
        if (meetingId || !id || !UUID_PATTERN.test(id)) {
          return route.abort('blockedbyclient');
        }
        // Capture the native UI UUID before forwarding its real create request,
        // including when the user-facing name has not yet been saved.
        meetingId = id;
        initialName = body.variables?.input?.name;
        creationRequestedAt = Date.now();
      } else if (
        body.operationName !== 'UpdateOneMeetingBooking' ||
        !meetingId ||
        body.variables?.idToUpdate !== meetingId
      ) {
        return route.abort('blockedbyclient');
      }
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
    }
  };

  const openField = async (fieldName: string) => {
    await assertDisabled();
    const field = page
      .getByTestId('record-fields-widget')
      .locator(`[id$="-${meetingId}-${fieldName}"]:not([id^="label-"])`);
    await expect(field).toBeVisible();
    // FieldsWidget mounts its interactive display inside a second, anchored
    // portal on hover. Click that display, as the widget's own stories do.
    await field.hover();
    const hoverPortal = field.locator(':scope > div').nth(1);
    await expect(hoverPortal).toBeVisible();
    await hoverPortal.locator(':scope > div > div > div').first().click();
  };

  const selectRelation = async (fieldName: string, record: ExistingRecord) => {
    await openField(fieldName);
    await page.getByRole('combobox').fill(record.name);
    await page
      .getByTestId('menu-item')
      .filter({
        has: page.getByText(record.name, { exact: true }),
      })
      .click();
    await expect
      .poll(async () => {
        const meeting = await readMeeting();
        return fieldName === 'company'
          ? meeting?.companyId === record.id
          : meeting?.wholesalerId === record.id;
      })
      .toBe(true);
  };

  const selectBooked = async () => {
    await openField('status');
    await page.getByText('Booked', { exact: true }).click();
  };

  try {
    const tenant = await assertWorkspaceConfigTenant({
      request: page.request,
      origin: APPROVED_ORIGIN,
    });
    phase = 'authenticated tenant expected identity comparison';
    expect(
      tenant.workspaceId ===
        requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID') &&
        tenant.userWorkspaceId ===
          requiredEnvironment('CORGI_CRM_EXPECTED_USER_WORKSPACE_ID'),
    ).toBe(true);
    phase = 'installed application and Telegram-disabled preflight';
    await assertDisabled();
    phase = 'authenticated actor metadata identity query';
    const identity = await graphql<unknown>(
      '/metadata',
      'ReadMeetingCanaryActorIdentity',
      MEETING_CANARY_ACTOR_IDENTITY_QUERY,
    );
    phase = 'workspace member Core query';
    const members = await graphql<unknown>(
      '/graphql',
      'FindMeetingCanaryActor',
      MEETING_CANARY_MEMBERS_QUERY,
    );
    phase = 'authenticated actor Core identity comparison';
    const actor = resolveMeetingCanaryActor({
      identity,
      members,
      expectedWorkspaceId: tenant.workspaceId,
      expectedUserWorkspaceId: tenant.userWorkspaceId,
    });
    workspaceMemberId = actor.workspaceMemberId;
    const { workspaceMembers, timeZone } = actor;

    phase = 'existing company and active owner discovery';
    const candidates = await graphql<{
      companies: Connection<ExistingRecord>;
      wholesalers: Connection<
        ExistingRecord & { workspaceMemberId: string | null }
      >;
    }>(
      '/graphql',
      'FindMeetingCanaryRelations',
      `
        query FindMeetingCanaryRelations {
          companies(first: 20) {
            edges {
              node {
                id
                name
              }
            }
          }
          wholesalers(first: 100) {
            edges {
              node {
                id
                name
                workspaceMemberId
              }
            }
          }
        }
      `,
    );
    const company = candidates.companies.edges
      .map(({ node }) => node)
      .find((record) => UUID_PATTERN.test(record.id) && record.name?.trim());
    const wholesaler = candidates.wholesalers.edges
      .map(({ node }) => node)
      .find(
        (record) =>
          UUID_PATTERN.test(record.id) &&
          record.name?.trim() &&
          workspaceMembers.some(
            (member) => member.id === record.workspaceMemberId && member.userId,
          ),
      );
    if (!company || !wholesaler)
      throw new Error('Existing canary relations are missing');

    phase = 'native Meetings navigation and creation';
    await page.goto('/objects/companies');
    await expect(
      page.getByRole('button', { name: 'Create new Company' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Meetings', exact: true }).click();
    await expect(page).toHaveURL(/\/objects\/meetingBookings(?:\?|$)/);
    await assertDisabled();
    await page.route(`${APPROVED_ORIGIN}/graphql`, guardNativeMutation);
    await page.getByRole('button', { name: 'Create new Meeting' }).click();
    await expect
      .poll(async () => (meetingId ? Boolean(await readMeeting()) : false))
      .toBe(true);
    const titleInput = page.locator('input:focus');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(meetingName);
    await titleInput.press('Enter');
    await expect.poll(async () => Boolean(meetingId)).toBe(true);
    await expect
      .poll(async () => (await readMeeting())?.name === meetingName)
      .toBe(true);
    named = true;
    await expect(page.getByTestId('record-fields-widget')).toBeVisible();
    const isRunOwnedRecordPage = (url: URL) =>
      url.origin === APPROVED_ORIGIN &&
      url.pathname === `/object/meetingBooking/${meetingId}`;
    if (!isRunOwnedRecordPage(new URL(page.url()))) {
      await page.getByRole('button', { name: 'Expand record' }).click();
    }
    await expect(page).toHaveURL(isRunOwnedRecordPage);

    phase = 'incomplete booking rejected without counting';
    await selectBooked();
    await expect
      .poll(
        async () => {
          const meeting = await readMeeting();
          return (
            meeting?.status === 'DRAFT' &&
            meeting.bookedAt === null &&
            meeting.bookedById === null &&
            Boolean(meeting.bookingValidationMessage)
          );
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    await page.reload();
    await expect(
      page
        .getByTestId('record-fields-widget')
        .getByText('Booking check', { exact: true }),
    ).toBeVisible();

    phase = 'native RIA and owner selection';
    await selectRelation('company', company);
    await selectRelation('wholesaler', wholesaler);

    const now = new Date();
    const month = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
    }).format(now);
    const year = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
    }).format(now);
    const selectDay = async (day: number) => {
      await openField('scheduledAt');
      const timeInput = page.getByPlaceholder(/^HH:mm(?: AA)?$/);
      await expect(timeInput).toBeVisible();
      await timeInput.fill(
        (await timeInput.getAttribute('placeholder')) === 'HH:mm AA'
          ? '10:00 AM'
          : '10:00',
      );
      await timeInput.press('Tab');
      await page
        .getByRole('option', {
          name: new RegExp(`, ${month} ${day}(?:st|nd|rd|th)?, ${year}$`),
        })
        .click();
      await expect
        .poll(async () => {
          const meeting = await readMeeting();
          if (!meeting?.scheduledAt) return false;
          const parts = Object.fromEntries(
            new Intl.DateTimeFormat('en-US', {
              timeZone,
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            })
              .formatToParts(new Date(meeting.scheduledAt))
              .map(({ type, value }) => [type, value]),
          );
          return (
            parts.year === year &&
            parts.month === month &&
            parts.day === String(day) &&
            parts.hour === '10' &&
            parts.minute === '00'
          );
        })
        .toBe(true);
    };

    phase = 'native schedule and validated booking';
    await selectDay(15);
    await selectBooked();
    await expect
      .poll(
        async () => {
          const meeting = await readMeeting();
          return (
            meeting?.status === 'BOOKED' &&
            Boolean(meeting.bookedAt) &&
            meeting.bookedById === workspaceMemberId &&
            !meeting.bookingValidationMessage
          );
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    const bookedMeeting = (await readMeeting())!;

    phase = 'native reschedule preserves first booking attribution';
    await selectDay(16);
    await expect
      .poll(async () => {
        const meeting = await readMeeting();
        return (
          meeting?.status === 'BOOKED' &&
          meeting.bookedAt === bookedMeeting.bookedAt &&
          meeting.bookedById === bookedMeeting.bookedById &&
          meeting.companyId === company.id &&
          meeting.wholesalerId === wholesaler.id &&
          meeting.scheduledAt !== bookedMeeting.scheduledAt
        );
      })
      .toBe(true);

    phase = 'native calendar displays the scheduled meeting';
    await page.goto('/objects/meetingBookings');
    await page.getByText('All Meetings', { exact: true }).click();
    await page.getByText('Meeting Calendar', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Today', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    const calendar = page.locator('[id*="scroll-wrapper-record-calendar-"]');
    await expect(calendar).toBeVisible();
    await expect(
      calendar.getByText(meetingName, { exact: true }),
    ).toBeVisible();
    await assertDisabled();
    const finalMeeting = await readMeeting();
    expect(
      finalMeeting?.bookedAt === bookedMeeting.bookedAt &&
        finalMeeting?.bookedById === bookedMeeting.bookedById,
    ).toBe(true);
  } catch {
    // Locator errors can contain real company/owner names; keep diagnostics
    // limited to the failed phase and never attach production DOM snapshots.
    failure = new Error(`Meeting canary failed during ${phase}`);
  } finally {
    await page.unroute(`${APPROVED_ORIGIN}/graphql`, guardNativeMutation);
    if (meetingId) {
      try {
        await assertDisabled();
        const meeting = await readMeeting();
        if (meeting) {
          const createdAt = Date.parse(meeting.createdAt);
          if (
            meeting.id !== meetingId ||
            meeting.createdBy?.workspaceMemberId !== workspaceMemberId ||
            !Number.isFinite(createdAt) ||
            createdAt < creationRequestedAt - 30_000 ||
            createdAt > Date.now() + 30_000 ||
            (meeting.name !== meetingName &&
              (named || (meeting.name ?? '') !== (initialName ?? '')))
          )
            throw new Error('Run-owned meeting cleanup identity check failed');
          const result = await graphql<{
            destroyMeetingBooking: { id: string };
          }>(
            '/graphql',
            'DestroyRunOwnedMeetingCanary',
            `
              mutation DestroyRunOwnedMeetingCanary($id: UUID!) {
                destroyMeetingBooking(id: $id) {
                  id
                }
              }
            `,
            { id: meetingId },
          );
          expect(result.destroyMeetingBooking.id === meetingId).toBe(true);
        }
        expect(await readMeeting()).toBeNull();
        cleanupVerified = true;
      } catch {
        failure = new Error(
          `Meeting canary cleanup failed after ${phase}; review run ${requiredEnvironment('GITHUB_RUN_ID')} before enabling Telegram`,
        );
      }
    }
    await page.close();
  }
  if (failure) throw failure;
  expect(cleanupVerified).toBe(true);

  let reportRuntime: Array<{
    period: string;
    activityCount: number;
    meetingCount: number;
    windowHours: number;
  }>;
  try {
    const applicationId = await assertDisabled();
    const functions = await graphql<{
      findManyLogicFunctions: Array<{
        id: string;
        universalIdentifier: string;
        name: string;
        applicationId: string;
        databaseEventTriggerSettings: unknown;
        httpRouteTriggerSettings: unknown;
        cronTriggerSettings: unknown;
        toolTriggerSettings: unknown;
        workflowActionTriggerSettings: unknown;
      }>;
    }>(
      '/metadata',
      'FindInstalledReportRuntimeVerification',
      `
        query FindInstalledReportRuntimeVerification {
          findManyLogicFunctions {
            id
            universalIdentifier
            name
            applicationId
            databaseEventTriggerSettings
            httpRouteTriggerSettings
            cronTriggerSettings
            toolTriggerSettings
            workflowActionTriggerSettings
          }
        }
      `,
    );
    const matches = functions.findManyLogicFunctions.filter(
      (candidate) =>
        candidate.universalIdentifier === REPORT_RUNTIME_IDENTIFIER,
    );
    expect(matches.length === 1).toBe(true);
    const runtimeFunction = matches[0]!;
    expect(
      UUID_PATTERN.test(runtimeFunction.id) &&
        runtimeFunction.applicationId === applicationId &&
        runtimeFunction.name === 'verify-report-runtime' &&
        [
          runtimeFunction.databaseEventTriggerSettings,
          runtimeFunction.httpRouteTriggerSettings,
          runtimeFunction.cronTriggerSettings,
          runtimeFunction.toolTriggerSettings,
          runtimeFunction.workflowActionTriggerSettings,
        ].every((settings) => settings === null),
    ).toBe(true);
    // This authenticated metadata route uses executeOneFromSource in LIVE mode.
    // It exercises the production SDK/schema, not a byte-identical worker build.
    const execution = await graphql<{
      executeOneLogicFunction: { status: string; data: unknown };
    }>(
      '/metadata',
      'ExecuteInstalledReportRuntimeVerification',
      `
        mutation ExecuteInstalledReportRuntimeVerification(
          $input: ExecuteOneLogicFunctionInput!
        ) {
          executeOneLogicFunction(input: $input) {
            status
            data
          }
        }
      `,
      {
        input: {
          id: runtimeFunction.id,
          payload: {
            confirmation:
              'VERIFY_CORGI_CRM_REPORT_RUNTIME_WITH_TELEGRAM_DISABLED',
            expectedUserWorkspaceId: requiredEnvironment(
              'CORGI_CRM_EXPECTED_USER_WORKSPACE_ID',
            ),
            expectedWorkspaceMemberId: workspaceMemberId,
          },
        },
      },
      75_000,
    );
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const { status, data } = execution.executeOneLogicFunction;
    if (
      status !== 'SUCCESS' ||
      !isRecord(data) ||
      Object.keys(data).length !== 2 ||
      data.status !== 'verified' ||
      !Array.isArray(data.reports) ||
      data.reports.length !== 3
    )
      throw new Error('Report runtime did not return verified evidence');
    const reports = data.reports;
    const reportKeys = [
      'period',
      'activityCount',
      'meetingCount',
      'windowHours',
      'allOwners',
      'activityLeaderboard',
      'meetingLeaderboard',
      'weeklyExcludesWeekends',
    ];
    reportRuntime = [
      ['daily', 24],
      ['weekly', 168],
      ['monthly', 720],
    ].map(([period, windowHours], index) => {
      const report: unknown = reports[index];
      if (
        !isRecord(report) ||
        Object.keys(report).length !== reportKeys.length ||
        !reportKeys.every((key) =>
          Object.prototype.hasOwnProperty.call(report, key),
        ) ||
        report.period !== period ||
        report.windowHours !== windowHours ||
        report.allOwners !== true ||
        report.activityLeaderboard !== true ||
        report.meetingLeaderboard !== true ||
        report.weeklyExcludesWeekends !== (period === 'weekly') ||
        typeof report.activityCount !== 'number' ||
        !Number.isSafeInteger(report.activityCount) ||
        report.activityCount < 0 ||
        typeof report.meetingCount !== 'number' ||
        !Number.isSafeInteger(report.meetingCount) ||
        report.meetingCount < 0
      )
        throw new Error('Report runtime returned invalid period evidence');
      return {
        period: String(period),
        windowHours: Number(windowHours),
        activityCount: report.activityCount,
        meetingCount: report.meetingCount,
      };
    });
    await assertDisabled();
  } catch {
    throw new Error(
      'Installed report runtime verification failed after exact meeting cleanup',
    );
  }
  console.log(
    JSON.stringify({
      meetingCanary: 'passed',
      nativeCreate: true,
      invalidBookingRejected: true,
      companyAndOwnerSelected: true,
      nativeSchedule: true,
      bookingStamped: true,
      reschedulePreservedAttribution: true,
      nativeCalendar: true,
      telegramDisabled: true,
      exactRecordCleanupVerified: cleanupVerified,
      installedReportRuntime: 'LIVE_FROM_SOURCE',
      reportRuntime,
    }),
  );
});
