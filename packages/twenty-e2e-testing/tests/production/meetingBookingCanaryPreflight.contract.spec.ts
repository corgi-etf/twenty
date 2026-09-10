import { expect, test } from '@playwright/test';
import { buildSchema, parse, validate, visit } from 'graphql';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';

import {
  MEETING_CANARY_ACTOR_IDENTITY_QUERY,
  MEETING_CANARY_MEMBERS_QUERY,
  meetingCanaryFailureCategory,
  MeetingCanaryCheckError,
  parseMeetingCanaryRecovery,
  resolveMeetingCanaryRecord,
  resolveMeetingCanaryActor,
  validateMeetingCanaryRecoveryRecord,
  createMeetingCanaryReceipt,
  meetingCanaryRecords,
  meetingCanaryGraphqlFailure,
} from './meetingBookingCanaryPreflight';

const repositoryRoot = join(__dirname, '../../../..');
const metadataSchema = buildSchema(
  readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-client-sdk/src/metadata/generated/schema.graphql',
    ),
    'utf8',
  ),
);
const coreMemberSource = readFileSync(
  join(
    repositoryRoot,
    'packages/twenty-server/src/modules/workspace-member/standard-objects/workspace-member.workspace-entity.ts',
  ),
  'utf8',
);
const coreMemberFields = [
  'id',
  ...Array.from(
    coreMemberSource
      .split('export class WorkspaceMemberWorkspaceEntity')[1]!
      .matchAll(/^  (\w+):/gm),
    ([, field]) => field,
  ),
];
const coreMemberSchema = buildSchema(`
  type WorkspaceMember { ${coreMemberFields.map((field) => `${field}: String`).join('\n')} }
  type WorkspaceMemberEdge { node: WorkspaceMember! }
  type WorkspaceMemberConnection { edges: [WorkspaceMemberEdge!]! }
  type Query { workspaceMembers(first: Int): WorkspaceMemberConnection! }
`);

test('queries only fields declared on the real Core WorkspaceMember entity', () => {
  expect(
    validate(coreMemberSchema, parse(MEETING_CANARY_MEMBERS_QUERY)),
  ).toEqual([]);
});

test('validates the authenticated identity query against the actual metadata schema', () => {
  expect(
    validate(metadataSchema, parse(MEETING_CANARY_ACTOR_IDENTITY_QUERY)),
  ).toEqual([]);
});

test('validates the existing installed-application disabled gate against the actual metadata schema', () => {
  const canarySource = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const query = canarySource.match(
    /`(\s*query MeetingCanaryDeliveryGate[\s\S]+?)`/,
  )?.[1];

  expect(query).toBeDefined();
  expect(validate(metadataSchema, parse(query!))).toEqual([]);
});

test('never selects unloaded nested relations from the application-list resolver', () => {
  const applicationServiceSource = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-server/src/engine/core-modules/application/application.service.ts',
    ),
    'utf8',
  );
  const listMethod = applicationServiceSource.match(
    /async findManyApplications\([\s\S]*?(?=\n  async findManyInstalledFlatApplications)/,
  )?.[0];
  const loadedRelations = Array.from(
    listMethod?.match(/relations: \[([^\]]+)\]/)?.[1].matchAll(/'([^']+)'/g) ??
      [],
    ([, relation]) => relation,
  );
  expect(loadedRelations).toEqual(['applicationRegistration']);
  const canarySource = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const query = canarySource.match(
    /`(\s*query MeetingCanaryDeliveryGate[\s\S]+?)`/,
  )?.[1];
  expect(query).toBeDefined();

  visit(parse(query!), {
    Field(node) {
      if (node.name.value !== 'findManyApplications') return;
      for (const selection of node.selectionSet?.selections ?? []) {
        if (selection.kind === 'Field' && selection.selectionSet) {
          expect(loadedRelations).toContain(selection.name.value);
        }
      }
    },
  });
});

test('reads installed variables through the tenant-scoped single-application loader', () => {
  const applicationServiceSource = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-server/src/engine/core-modules/application/application.service.ts',
    ),
    'utf8',
  );
  const singleMethod = applicationServiceSource.match(
    /async findOneApplication\([\s\S]*?(?=\n  async findOneApplicationOrThrow)/,
  )?.[0];
  expect(singleMethod).toContain(
    'application.applicationVariables = applicationVariables',
  );
  expect(singleMethod).toContain(
    'where: { applicationId: application.id, workspaceId }',
  );
  const canarySource = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const query = canarySource.match(
    /`(\s*query MeetingCanaryDeliveryGate[\s\S]+?)`/,
  )?.[1];
  expect(query).toBeDefined();
  const applicationFields: string[] = [];
  visit(parse(query!), {
    Field(node) {
      if (node.name.value !== 'findOneApplication') return;
      applicationFields.push(node.name.value);
      expect(node.arguments).toEqual([
        expect.objectContaining({
          name: expect.objectContaining({ value: 'universalIdentifier' }),
          value: expect.objectContaining({
            kind: 'Variable',
            name: expect.objectContaining({ value: 'universalIdentifier' }),
          }),
        }),
      ]);
    },
  });
  expect(applicationFields).toEqual(['findOneApplication']);
  expect(canarySource).toContain(
    '{ universalIdentifier: APPLICATION_IDENTIFIER }',
  );
});

const workspaceId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const memberId = '44444444-4444-4444-8444-444444444444';
const otherId = '55555555-5555-4555-8555-555555555555';
const fixture = () => ({
  expectedWorkspaceId: workspaceId,
  expectedUserWorkspaceId: membershipId,
  identity: {
    currentUser: {
      id: userId,
      currentWorkspace: { id: workspaceId },
      currentUserWorkspace: {
        id: membershipId,
        userId,
        deletedAt: null as string | null,
        isImpersonating: false as boolean | null,
      },
      workspaceMember: { id: memberId, userWorkspaceId: membershipId },
    },
  },
  members: {
    workspaceMembers: {
      edges: [
        {
          node: {
            id: memberId,
            userId: userId as string | null,
            timeZone: 'America/Chicago' as string | null,
          },
        },
      ],
    },
  },
});

test('binds the Core userId to the authenticated user, membership, workspace and member', () => {
  const result = resolveMeetingCanaryActor(fixture());

  expect(result.workspaceMemberId).toBe(memberId);
  expect(result.timeZone).toBe('America/Chicago');
  expect(result.workspaceMembers).toEqual([
    { id: memberId, userId, timeZone: 'America/Chicago' },
  ]);
});

const identityFailures: Array<{
  name: string;
  change: (value: ReturnType<typeof fixture>) => void;
}> = [
  {
    name: 'workspace mismatch',
    change: (value) => {
      value.identity.currentUser.currentWorkspace.id = otherId;
    },
  },
  {
    name: 'membership mismatch',
    change: (value) => {
      value.identity.currentUser.currentUserWorkspace.id = otherId;
    },
  },
  {
    name: 'membership belongs to another user',
    change: (value) => {
      value.identity.currentUser.currentUserWorkspace.userId = otherId;
    },
  },
  {
    name: 'authenticated member belongs to another membership',
    change: (value) => {
      value.identity.currentUser.workspaceMember.userWorkspaceId = otherId;
    },
  },
  {
    name: 'deleted membership',
    change: (value) => {
      value.identity.currentUser.currentUserWorkspace.deletedAt =
        '2026-01-01T00:00:00Z';
    },
  },
  {
    name: 'impersonating session',
    change: (value) => {
      value.identity.currentUser.currentUserWorkspace.isImpersonating = true;
    },
  },
  {
    name: 'different Core member ID',
    change: (value) => {
      value.members.workspaceMembers.edges[0]!.node.id = otherId;
    },
  },
  {
    name: 'different Core user ID',
    change: (value) => {
      value.members.workspaceMembers.edges[0]!.node.userId = otherId;
    },
  },
  {
    name: 'missing Core user ID',
    change: (value) => {
      value.members.workspaceMembers.edges[0]!.node.userId = null;
    },
  },
  {
    name: 'ambiguous Core actor',
    change: (value) => {
      value.members.workspaceMembers.edges.push({
        node: { id: otherId, userId, timeZone: 'UTC' },
      });
    },
  },
  {
    name: 'missing actor',
    change: (value) => {
      value.members.workspaceMembers.edges = [];
    },
  },
];
for (const { name, change } of identityFailures) {
  test(`rejects ${name} before native mutations`, () => {
    const value = fixture();
    change(value);

    expect(() => resolveMeetingCanaryActor(value)).toThrow();
  });
}

test('rejects malformed responses without disclosing response values', () => {
  const value = fixture();
  value.members.workspaceMembers.edges[0]!.node.timeZone =
    'private-invalid-zone';

  expect(() => resolveMeetingCanaryActor(value)).toThrow(
    'Meeting canary member time zone is invalid',
  );
  expect(() =>
    resolveMeetingCanaryActor({ ...fixture(), identity: null }),
  ).toThrow('Meeting canary identity response is malformed');
});

for (const timeZone of ['system', null]) {
  test(`preserves UTC fallback for ${timeZone} member time zone`, () => {
    const value = fixture();
    value.members.workspaceMembers.edges[0]!.node.timeZone = timeZone;

    expect(resolveMeetingCanaryActor(value).timeZone).toBe('UTC');
  });
}

const revisionPreflight = (
  overrides: Record<string, string> = {},
  childError?: Error,
) => {
  const canarySource = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const beforeAllSource = canarySource.match(
    /test\.beforeAll\(((?:async )?\(\) => \{[\s\S]*?\n\})\);/,
  )?.[1];
  expect(beforeAllSource).toBeDefined();
  const origin = 'https://crm.corgiinvest.com';
  const environment: Record<string, string> = {
    CRM_MEETING_CANARY_ENABLED: 'true',
    CRM_MEETING_CANARY_CONFIRMATION:
      'VERIFY_NATIVE_CRM_MEETING_WITH_TELEGRAM_DISABLED',
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'Corgi-ETF/twenty',
    GITHUB_WORKFLOW_REF:
      'Corgi-ETF/twenty/.github/workflows/corgi-crm-app-production.yml@refs/heads/main',
    CRM_MEETING_CANARY_OPERATION: 'configure-telegram',
    CRM_DEPLOYED_SHA: 'a'.repeat(40),
    GITHUB_SHA: 'b'.repeat(40),
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
    PATH: '/test/path',
    CORGI_CRM_API_KEY: 'synthetic-secret-must-not-be-inherited',
    ...overrides,
  };
  const calls: Array<{
    executable: string;
    args: string[];
    options: Record<string, unknown>;
  }> = [];
  const execute = runInNewContext(`(${beforeAllSource})`, {
    expect,
    requiredEnvironment: (name: string) => environment[name],
    requireProductionEnvironment: () => ({
      FRONTEND_BASE_URL: origin,
      BACKEND_BASE_URL: origin,
    }),
    APPROVED_ORIGIN: origin,
    URL,
    __dirname,
    resolve,
    promisify,
    process: { execPath: process.execPath, env: environment },
    execFile: (
      executable: string,
      args: string[],
      options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      calls.push({ executable, args, options });
      callback(childError ?? null, '', '');
    },
  }) as () => Promise<void>;
  return { execute, calls, environment };
};

for (const operation of ['publish-and-install', 'configure-telegram']) {
  test(`independently checks unchanged SHAs through the fixed guard for ${operation}`, async () => {
    const { execute, calls, environment } = revisionPreflight({
      CRM_MEETING_CANARY_OPERATION: operation,
    });
    const originalEnvironment = { ...environment };

    await execute();

    expect(calls).toEqual([
      {
        executable: process.execPath,
        args: [
          join(
            repositoryRoot,
            'packages/twenty-apps/internal/corgi-crm/scripts/deployment-revision-guard.mjs',
          ),
          'a'.repeat(40),
          'b'.repeat(40),
        ],
        options: {
          cwd: repositoryRoot,
          env: { PATH: '/test/path' },
          shell: false,
          timeout: 15_000,
          maxBuffer: 64 * 1024,
        },
      },
    ]);
    expect(environment).toEqual(originalEnvironment);
  });
}

test('sanitizes revision-helper failures before any browser activity', async () => {
  const { execute } = revisionPreflight(
    {},
    new Error('synthetic secret stderr'),
  );

  await assert.rejects(async () => execute(), {
    message: 'Meeting canary failed during deployment revision preflight',
  });
});

for (const [name, value] of [
  ['CRM_DEPLOYED_SHA', 'invalid'],
  ['GITHUB_SHA', 'A'.repeat(40)],
  ['CRM_MEETING_CANARY_OPERATION', 'disable-telegram'],
  ['GITHUB_REF', 'refs/heads/untrusted'],
  ['GITHUB_EVENT_NAME', 'pull_request'],
]) {
  test(`rejects unapproved ${name} before invoking the revision helper`, async () => {
    const { execute, calls } = revisionPreflight({ [name!]: value! });

    await assert.rejects(async () => execute());
    expect(calls).toEqual([]);
  });
}

const nativeRecordNavigation = (initialUrl: string, expandedUrl: string) => {
  const canarySource = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const navigationSource = canarySource.match(
    /named = true;([\s\S]*?)\n\s*phase = 'incomplete booking rejected without counting';/,
  )?.[1];
  expect(navigationSource).toBeDefined();
  let currentUrl = initialUrl;
  let expansionCount = 0;
  let fieldsChecked = false;
  const origin = 'https://crm.corgiinvest.com';
  const page = {
    url: () => currentUrl,
    getByTestId: (testId: string) => {
      expect(testId).toBe('record-fields-widget');
      return 'fields-widget';
    },
    getByRole: (role: string, options: { name: string }) => {
      expect(role).toBe('button');
      expect(options.name).toBe('Expand record');
      return {
        click: async () => {
          expansionCount += 1;
          if (new URL(currentUrl).pathname.startsWith('/object/')) {
            throw new Error('Full-page records have no Expand record button');
          }
          currentUrl = expandedUrl;
        },
      };
    },
  };
  const navigationJavaScript = navigationSource!.replace('(url: URL)', '(url)');
  const execute = runInNewContext(`(async () => {${navigationJavaScript}})`, {
    page,
    meetingId: memberId,
    APPROVED_ORIGIN: origin,
    URL,
    expect: (actual: unknown) => ({
      toBeVisible: async () => {
        expect(actual).toBe('fields-widget');
        fieldsChecked = true;
      },
      toHaveURL: async (matcher: RegExp | ((url: URL) => boolean)) => {
        expect(actual).toBe(page);
        expect(
          typeof matcher === 'function'
            ? matcher(new URL(currentUrl))
            : matcher.test(currentUrl),
        ).toBe(true);
      },
    }),
  }) as () => Promise<void>;
  return {
    execute,
    result: () => ({ expansionCount, fieldsChecked }),
  };
};

for (const suffix of ['', '?viewId=synthetic#timeline']) {
  test(`accepts native full-page creation only at the exact record route (${suffix || 'no suffix'})`, async () => {
    const recordUrl = `https://crm.corgiinvest.com/object/meetingBooking/${memberId}${suffix}`;
    const navigation = nativeRecordNavigation(recordUrl, recordUrl);

    await navigation.execute();

    expect(navigation.result()).toEqual({
      expansionCount: 0,
      fieldsChecked: true,
    });
  });

  test(`expands native side-panel creation into the exact record route (${suffix || 'no suffix'})`, async () => {
    const navigation = nativeRecordNavigation(
      'https://crm.corgiinvest.com/objects/meetingBookings',
      `https://crm.corgiinvest.com/object/meetingBooking/${memberId}${suffix}`,
    );

    await navigation.execute();

    expect(navigation.result()).toEqual({
      expansionCount: 1,
      fieldsChecked: true,
    });
  });
}

for (const recordUrl of [
  `https://wrong-origin.example/object/meetingBooking/${memberId}`,
  `https://wrong-origin.example/object/meetingBooking/${memberId}#timeline`,
  `https://crm.corgiinvest.com/object/meetingBooking/${otherId}?viewId=synthetic`,
  `https://crm.corgiinvest.com/object/company/${memberId}`,
  `https://crm.corgiinvest.com/object/meetingBooking/${memberId}/extra`,
]) {
  test(`rejects native expansion outside the exact approved record route: ${recordUrl}`, async () => {
    const navigation = nativeRecordNavigation(
      'https://crm.corgiinvest.com/objects/meetingBookings',
      recordUrl,
    );

    await assert.rejects(async () => navigation.execute());
  });
}

test('uses a bounded exact-ID list read because the real singular resolver throws on absence', () => {
  const serverSource = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-server/src/engine/api/common/common-query-runners/common-find-one-query-runner.service.ts',
    ),
    'utf8',
  );
  expect(serverSource).toMatch(
    /if \(!objectRecord\) \{\s*throw new CommonQueryRunnerException/,
  );
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  expect(source).not.toMatch(/\bmeetingBooking\(\s*filter:/);
  expect(source).toMatch(
    /meetingBookings\(\s*first: 2\s*filter: \{\s*id: \{ eq: \$id \}/,
  );
});

test('recovery obeys the actual runtime one-operator-per-field filter contract', () => {
  const processor = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-server/src/engine/api/common/common-args-processors/filter-arg-processor/utils/validate-and-transform-operator-and-value.util.ts',
    ),
    'utf8',
  );
  expect(processor).toContain('if (entries.length !== 1)');
  expect(processor).toContain(
    'CommonQueryRunnerExceptionCode.INVALID_ARGS_FILTER',
  );
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const query = source.match(
    /`(\s*query FindPriorRunMeetingCanary[\s\S]*?)`/,
  )?.[1];
  expect(query).toBeDefined();
  const operators: string[] = [];
  visit(parse(query!), {
    ObjectField(node) {
      if (node.name.value !== 'createdAt') return;
      expect(node.value.kind).toBe('ObjectValue');
      if (node.value.kind !== 'ObjectValue')
        throw new Error('Expected field filter');
      expect(node.value.fields.length).toBe(1);
      operators.push(node.value.fields[0]!.name.value);
    },
  });
  expect(operators.sort()).toEqual(['gte', 'lt']);
});

const recoveryEnvironment = () => ({
  CRM_MEETING_CANARY_RECOVERY_RUN_ID: '34464729678',
  CRM_MEETING_CANARY_RECOVERY_RUN_ATTEMPT: '1',
  CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER: '2026-09-10T10:19:26Z',
  CRM_MEETING_CANARY_RECOVERY_CREATED_BEFORE: '2026-09-10T10:19:41Z',
  CRM_MEETING_CANARY_RECOVERY_CONFIRMATION: 'CLEANUP_RUN_OWNED_MEETING',
});
const recoveryRecord = () => ({
  id: otherId,
  name: `CRM meeting canary 34464729678-1-${workspaceId}`,
  createdAt: '2026-09-10T10:19:30Z',
  updatedAt: '2026-09-10T10:19:32Z',
  createdBy: { workspaceMemberId: memberId },
  companyId: null,
  wholesalerId: null,
  scheduledAt: null,
  status: 'DRAFT',
  bookedAt: null,
  bookedById: null,
  bookingValidationMessage: null,
});

test('distinguishes exact-ID presence from verified absence without swallowing read errors', () => {
  const record = recoveryRecord();
  expect(
    resolveMeetingCanaryRecord(
      { meetingBookings: { edges: [{ node: record }] } },
      otherId,
    ),
  ).toEqual(record);
  expect(
    resolveMeetingCanaryRecord({ meetingBookings: { edges: [] } }, otherId),
  ).toBeNull();
  for (const response of [
    null,
    {},
    { meetingBookings: { edges: null } },
    { meetingBookings: { edges: [{ node: record }, { node: record }] } },
    { meetingBookings: { edges: [{ node: { ...record, id: workspaceId } }] } },
    {
      meetingBookings: {
        edges: [{ node: { ...record, createdAt: 'invalid' } }],
      },
    },
  ])
    expect(() => resolveMeetingCanaryRecord(response, otherId)).toThrow();
});

test('requires complete explicit recovery confirmation and a bounded valid UTC window', () => {
  expect(parseMeetingCanaryRecovery({})).toBeNull();
  expect(parseMeetingCanaryRecovery(recoveryEnvironment())).toMatchObject({
    runId: '34464729678',
    attempt: '1',
  });
  for (const [key, value] of [
    ['CRM_MEETING_CANARY_RECOVERY_RUN_ID', ''],
    ['CRM_MEETING_CANARY_RECOVERY_RUN_ATTEMPT', '1-2'],
    ['CRM_MEETING_CANARY_RECOVERY_CONFIRMATION', 'yes'],
    ['CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER', 'invalid'],
    ['CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER', '2026-09-10T10:20:00Z'],
    ['CRM_MEETING_CANARY_RECOVERY_CREATED_BEFORE', '2026-09-10T11:19:41Z'],
  ])
    expect(() =>
      parseMeetingCanaryRecovery({ ...recoveryEnvironment(), [key!]: value }),
    ).toThrow();
});

test('requires full UUID-suffixed name, exact authenticated creator and creation window before recovery deletion', () => {
  const recovery = parseMeetingCanaryRecovery(recoveryEnvironment())!;
  expect(() =>
    validateMeetingCanaryRecoveryRecord(recoveryRecord(), recovery, memberId),
  ).not.toThrow();
  for (const record of [
    {
      ...recoveryRecord(),
      name: 'CRM meeting canary 34464729678-1-not-a-uuid',
    },
    {
      ...recoveryRecord(),
      name: `CRM meeting canary 34464729678-2-${workspaceId}`,
    },
    { ...recoveryRecord(), createdBy: { workspaceMemberId: userId } },
    { ...recoveryRecord(), createdAt: '2026-09-10T10:19:25Z' },
    { ...recoveryRecord(), createdAt: '2026-09-10T10:19:41Z' },
    { ...recoveryRecord(), updatedAt: '2026-09-10T10:19:42Z' },
  ])
    expect(() =>
      validateMeetingCanaryRecoveryRecord(record, recovery, memberId),
    ).toThrow();
});

test('diagnostic categories never include raw error messages or response contents', () => {
  expect(
    meetingCanaryFailureCategory(new MeetingCanaryCheckError('OWNERSHIP')),
  ).toBe('OWNERSHIP');
  expect(
    meetingCanaryFailureCategory({
      name: 'TimeoutError',
      message: 'private DOM',
    }),
  ).toBe('TIMEOUT');
  expect(
    meetingCanaryFailureCategory({
      matcherResult: { actual: 'private record' },
    }),
  ).toBe('ASSERTION');
  expect(meetingCanaryFailureCategory(new Error('private secret'))).toBe(
    'UNKNOWN',
  );
});

test('receipt contains only validated synthetic run and creation identifiers', () => {
  const receipt = createMeetingCanaryReceipt({
    runId: '34464729678',
    attempt: '1',
    meetingId: otherId,
    nameNonce: workspaceId,
    creationRequestedAt: Date.parse('2026-09-10T10:19:30Z'),
  });
  expect(receipt).toEqual({
    runId: '34464729678',
    attempt: '1',
    meetingId: otherId,
    nameNonce: workspaceId,
    creationRequestedAt: '2026-09-10T10:19:30.000Z',
  });
  expect(() =>
    createMeetingCanaryReceipt({
      ...receipt,
      runId: 'private',
      creationRequestedAt: Date.now(),
    }),
  ).toThrow();
});

const runRecovery = (options: {
  candidates: Array<ReturnType<typeof recoveryRecord>>;
  reread?: ReturnType<typeof recoveryRecord> | null;
  readError?: boolean;
  destroyError?: boolean;
  readbackPresent?: boolean;
  disabledGate?: number;
}) => {
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  const recoverySource = source.match(
    /    if \(recovery\) \{[\s\S]*?(?=\n    step = 'start';)/,
  )?.[0];
  expect(recoverySource).toBeDefined();
  const javascript = recoverySource!
    .replace(/graphql<unknown>/g, 'graphql')
    .replace(
      /graphql<\{\s*destroyMeetingBooking: \{ id: string \};\s*\}>/g,
      'graphql',
    );
  const calls: string[] = [];
  let readCount = 0;
  let gateCount = 0;
  const receipt: unknown[] = [];
  const execute = runInNewContext(`(async () => {${javascript}})`, {
    phase: '',
    step: '',
    expect,
    recovery: parseMeetingCanaryRecovery(recoveryEnvironment()),
    workspaceMemberId: memberId,
    meetingCanaryRecords,
    MeetingCanaryCheckError,
    validateMeetingCanaryRecoveryRecord,
    assertDisabled: async () => {
      calls.push('disabled');
      if (++gateCount === options.disabledGate)
        throw new MeetingCanaryCheckError('OWNERSHIP');
    },
    graphql: async (
      endpoint: string,
      operation: string,
      query: string,
      variables: Record<string, string>,
    ) => {
      expect(endpoint).toBe('/graphql');
      calls.push(operation);
      if (operation === 'FindPriorRunMeetingCanary') {
        expect(query).toContain('first: 2');
        expect(query).toContain('startsWith: $prefix');
        expect(query).toContain('createdAt: { gte: $after }');
        expect(query).toContain('createdAt: { lt: $before }');
        expect(query).toContain('is: NULL');
        expect(query).toContain('is: NOT_NULL');
        expect(variables).toEqual({
          prefix: 'CRM meeting canary 34464729678-1-',
          after: '2026-09-10T10:19:26Z',
          before: '2026-09-10T10:19:41Z',
        });
        return {
          meetingBookings: {
            edges: options.candidates.map((node) => ({ node })),
          },
        };
      }
      expect(operation).toBe('DestroyPriorRunMeetingCanary');
      expect(variables).toEqual({ id: otherId });
      if (options.destroyError)
        throw new MeetingCanaryCheckError('GRAPHQL_PERMISSION');
      return { destroyMeetingBooking: { id: otherId } };
    },
    readMeetingById: async (id: string) => {
      calls.push('read-exact');
      expect(id).toBe(otherId);
      if (options.readError) throw new MeetingCanaryCheckError('GRAPHQL_OTHER');
      readCount += 1;
      const record =
        readCount === 1
          ? options.reread === undefined
            ? recoveryRecord()
            : options.reread
          : options.readbackPresent
            ? recoveryRecord()
            : null;
      return resolveMeetingCanaryRecord(
        { meetingBookings: { edges: record ? [{ node: record }] : [] } },
        id,
      );
    },
    console: { log: (value: string) => receipt.push(JSON.parse(value)) },
  }) as () => Promise<void>;
  return { execute, calls, receipt };
};

test('zero prior candidates is verified already absent and never deletes', async () => {
  const run = runRecovery({ candidates: [] });
  await run.execute();
  expect(run.calls).toEqual(['disabled', 'FindPriorRunMeetingCanary']);
  expect(run.receipt).toEqual([
    { meetingCanaryRecovery: 'already-absent', candidateCount: 0 },
  ]);
});

test('one exact prior candidate is revalidated, destroyed by UUID and verified absent', async () => {
  const run = runRecovery({ candidates: [recoveryRecord()] });
  await run.execute();
  expect(run.calls).toEqual([
    'disabled',
    'FindPriorRunMeetingCanary',
    'read-exact',
    'disabled',
    'DestroyPriorRunMeetingCanary',
    'read-exact',
  ]);
  expect(run.receipt).toEqual([
    { meetingCanaryRecovery: 'deleted-exact-run-record', candidateCount: 1 },
  ]);
});

for (const [name, options] of Object.entries({
  ambiguous: { candidates: [recoveryRecord(), recoveryRecord()] },
  creatorChanged: {
    candidates: [recoveryRecord()],
    reread: { ...recoveryRecord(), createdBy: { workspaceMemberId: userId } },
  },
  editedAfterRun: {
    candidates: [{ ...recoveryRecord(), updatedAt: '2026-09-10T10:20:00Z' }],
  },
  updatedAtChanged: {
    candidates: [recoveryRecord()],
    reread: { ...recoveryRecord(), updatedAt: '2026-09-10T10:19:33Z' },
  },
  nameChanged: {
    candidates: [recoveryRecord()],
    reread: {
      ...recoveryRecord(),
      name: `CRM meeting canary 34464729678-1-${userId}`,
    },
  },
  readError: { candidates: [recoveryRecord()], readError: true },
  disabledGate: { candidates: [recoveryRecord()], disabledGate: 2 },
})) {
  test(`recovery ${name} fails before any delete`, async () => {
    const run = runRecovery(options);
    await assert.rejects(async () => run.execute());
    expect(run.calls).not.toContain('DestroyPriorRunMeetingCanary');
    expect(run.receipt).toEqual([]);
  });
}

for (const options of [{ destroyError: true }, { readbackPresent: true }]) {
  test(`recovery rejects ${Object.keys(options)[0]} without claiming cleanup`, async () => {
    const run = runRecovery({ candidates: [recoveryRecord()], ...options });
    await assert.rejects(async () => run.execute());
    expect(run.receipt).toEqual([]);
  });
}

test('GraphQL diagnostics classify only known codes without exposing messages', () => {
  for (const [code, expected] of [
    ['FORBIDDEN', 'GRAPHQL_PERMISSION'],
    ['GRAPHQL_VALIDATION_FAILED', 'GRAPHQL_VALIDATION'],
    ['RECORD_NOT_FOUND', 'GRAPHQL_RECORD_NOT_FOUND'],
    ['private-code', 'GRAPHQL_OTHER'],
  ])
    expect(
      meetingCanaryFailureCategory(
        meetingCanaryGraphqlFailure([
          { message: 'private', extensions: { code } },
        ]),
      ),
    ).toBe(expected);
});

test('relation search uses the rendered placeholder because DropdownMenuSearchInput drops its requested combobox role', () => {
  const pickerSource = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItemsWithSearch.tsx',
    ),
    'utf8',
  );
  const inputSource = readFileSync(
    join(
      repositoryRoot,
      'packages/twenty-front/src/modules/ui/layout/dropdown/components/DropdownMenuSearchInput.tsx',
    ),
    'utf8',
  );
  expect(pickerSource).toMatch(
    /<DropdownMenuSearchInput[\s\S]*?role="combobox"/,
  );
  expect(inputSource).toContain(
    '({ value, onChange, placeholder, type }, forwardedRef)',
  );
  expect(inputSource).toContain(
    '...{ onChange, placeholder: translatedPlaceholder, type, value }',
  );
  expect(inputSource).not.toContain('role=');
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  expect(source.includes("getByRole('combobox')")).toBe(false);
  expect(source).toContain("getByPlaceholder('Search', { exact: true })");
  expect(source).toContain('[data-select-disable="false"]:visible');
  expect(source).toContain('await expect(relationDropdown).toHaveCount(1)');
});

test('canary bounds actions while preserving longer backend validation polls and exact cleanup', () => {
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  expect(source).toMatch(/test\.use\(\{[\s\S]*?actionTimeout: 15_000/);
  expect(source.match(/timeout: 45_000/g)?.length).toBe(2);
  for (const step of [
    'relation search',
    'relation choice',
    'relation persistence',
  ]) {
    expect(source).toContain(step);
  }
  expect(source).toContain(
    'meeting.createdBy?.workspaceMemberId !== workspaceMemberId',
  );
  expect(source).toContain('expect(await readMeeting()).toBeNull()');
});

test('canary stdout is restricted to synthetic receipts and static aggregate evidence', () => {
  const source = readFileSync(
    join(__dirname, 'meetingBooking.maintenance.spec.ts'),
    'utf8',
  );
  expect(
    Array.from(source.matchAll(/console\.\w+\(/g), ([call]) => call),
  ).toEqual(['console.log(', 'console.log(', 'console.log(']);
  const outputs = Array.from(
    source.matchAll(
      /console\.log\(\s*JSON\.stringify\(\{([\s\S]*?)\n\s*\}\),\s*\);/g,
    ),
    ([, body]) => body!.replace(/\s/g, ''),
  );
  expect(outputs).toEqual([
    [
      'meetingCanaryReceipt:createMeetingCanaryReceipt({',
      "runId:requiredEnvironment('GITHUB_RUN_ID'),",
      "attempt:requiredEnvironment('GITHUB_RUN_ATTEMPT'),",
      'meetingId,nameNonce,creationRequestedAt,}),',
    ].join(''),
    "meetingCanaryRecovery:destroyed?'deleted-exact-run-record':'already-absent',candidateCount:candidates.length,",
    [
      "meetingCanary:'passed',nativeCreate:true,invalidBookingRejected:true,",
      'companyAndOwnerSelected:true,nativeSchedule:true,bookingStamped:true,',
      'reschedulePreservedAttribution:true,nativeCalendar:true,telegramDisabled:true,',
      'exactRecordCleanupVerified:cleanupVerified,',
      "installedReportRuntime:'LIVE_FROM_SOURCE',reportRuntime,",
    ].join(''),
  ]);
});
