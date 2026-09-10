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
  resolveMeetingCanaryActor,
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
