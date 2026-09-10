import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { WorkspaceConfigCheckpoint } from '../src/execution.ts';
import {
  assertWorkspaceConfigTenant,
  createTwentyTerritoryIdentityDiscoveryApi,
  createTwentyWorkspaceConfigApi,
  createTwentyWorkspaceMetadataBootstrapApi,
  createWorkspaceConfigRequestGate,
  preflightWorkspaceConfigCheckpoint,
  type WorkspaceConfigRequestContext,
  type WorkspaceConfigResponse,
} from '../src/twenty-api.ts';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

const response = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): WorkspaceConfigResponse => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  headers: () => headers,
  json: async () => body,
  dispose: async () => undefined,
});

class FakeRequest implements WorkspaceConfigRequestContext {
  calls: Array<{ method: string; url: string; data?: unknown }> = [];
  responses: WorkspaceConfigResponse[] = [];

  private next(method: string, url: string, data?: unknown) {
    this.calls.push({ method, url, data });
    const next = this.responses.shift();
    if (!next) throw new Error('Missing fake response');

    return Promise.resolve(next);
  }

  get(url: string) {
    return this.next('GET', url);
  }

  post(url: string, options: { data?: unknown }) {
    return this.next('POST', url, options.data);
  }

  patch(url: string, options: { data?: unknown }) {
    return this.next('PATCH', url, options.data);
  }
}

const immediateGate = createWorkspaceConfigRequestGate({
  minimumIntervalMs: 0,
});

const tenantPreflightBody = ({
  workspaceId = WORKSPACE_ID,
  workspaceActivationStatus = 'ACTIVE',
  userId = USER_ID,
  membershipUserId = userId,
  userWorkspaceId = USER_WORKSPACE_ID,
  deletedAt = null,
  permissionFlags = ['DATA_MODEL'],
  isImpersonating = false,
}: {
  workspaceId?: string;
  workspaceActivationStatus?: string;
  userId?: string;
  membershipUserId?: string;
  userWorkspaceId?: string;
  deletedAt?: string | null;
  permissionFlags?: string[];
  isImpersonating?: boolean;
} = {}) => ({
  data: {
    currentUser: {
      id: userId,
      currentWorkspace: {
        id: workspaceId,
        displayName: 'Corgi ETF',
        activationStatus: workspaceActivationStatus,
      },
      currentUserWorkspace: {
        id: userWorkspaceId,
        userId: membershipUserId,
        deletedAt,
        permissionFlags,
        isImpersonating,
      },
    },
  },
});

test('tenant preflight trusts the exact approved effective membership', async () => {
  const request = new FakeRequest();
  request.responses.push(response(tenantPreflightBody()));

  const tenant = await assertWorkspaceConfigTenant({
    request,
    origin: 'https://crm.corgiinvest.com',
    requestGate: immediateGate,
  });
  assert.equal(tenant.workspaceId, WORKSPACE_ID);
  assert.equal(tenant.userWorkspaceId, USER_WORKSPACE_ID);
  assert.equal(request.calls.length, 1);
  assert.equal(request.calls[0]?.url, 'https://crm.corgiinvest.com/metadata');
  const query = String((request.calls[0]?.data as { query?: unknown }).query);
  assert.match(query, /^query /);
  assert.doesNotMatch(query, /getRoles/);
});

test('tenant preflight rejects a malformed authenticated workspace identity', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response(tenantPreflightBody({ workspaceId: 'not-a-uuid' })),
  );

  await assert.rejects(
    assertWorkspaceConfigTenant({
      request,
      origin: 'https://crm.corgiinvest.com',
      requestGate: immediateGate,
    }),
    /tenant is not approved/,
  );
});

test('tenant preflight rejects inactive or unbound memberships', async () => {
  const invalidSessions = [
    tenantPreflightBody({ workspaceActivationStatus: 'SUSPENDED' }),
    tenantPreflightBody({
      membershipUserId: '44444444-4444-4444-8444-444444444444',
    }),
    tenantPreflightBody({ userWorkspaceId: 'not-a-uuid' }),
    tenantPreflightBody({ deletedAt: '2026-09-09T22:00:00.000Z' }),
  ];

  for (const body of invalidSessions) {
    const request = new FakeRequest();
    request.responses.push(response(body));
    await assert.rejects(
      assertWorkspaceConfigTenant({
        request,
        origin: 'https://crm.corgiinvest.com',
        requestGate: immediateGate,
      }),
      /tenant is not approved|session lacks metadata permission/,
    );
  }
});

test('tenant preflight rejects the wrong member, missing permission, and impersonation', async () => {
  const invalidSessions = [
    tenantPreflightBody({ permissionFlags: [] }),
    tenantPreflightBody({ isImpersonating: true }),
  ];

  for (const body of invalidSessions) {
    const request = new FakeRequest();
    request.responses.push(response(body));

    await assert.rejects(
      assertWorkspaceConfigTenant({
        request,
        origin: 'https://crm.corgiinvest.com',
        requestGate: immediateGate,
      }),
      /session lacks metadata permission/,
    );
  }
});

test('loads metadata, views, navigation, and companies without exposing a write', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({
      data: {
        objects: [
          {
            id: 'company-object-id',
            nameSingular: 'company',
            namePlural: 'companies',
            fields: [],
          },
        ],
      },
      pageInfo: { hasNextPage: false },
    }),
    response({
      data: {
        getViews: [],
        navigationMenuItems: [],
      },
    }),
    response({
      data: {
        companies: [
          {
            id: 'company-id',
            updatedAt: '2026-09-08T00:00:00.000Z',
            address: { addressState: 'IL', addressPostcode: '60601' },
          },
        ],
      },
      pageInfo: { hasNextPage: false },
    }),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-workspace-config.json'),
    requestGate: immediateGate,
  });

  const snapshot = await api.listWorkspaceConfigSnapshot();
  const companies = await api.listCompanies();
  assert.equal(snapshot.objects[0]?.nameSingular, 'company');
  assert.equal(companies[0]?.id, 'company-id');
  assert.deepEqual(
    request.calls.map(({ method }) => method),
    ['GET', 'POST', 'GET'],
  );
  assert.match(request.calls[0]!.url, /\/rest\/metadata\/objects\?/);
  assert.equal(request.calls[1]!.url, 'https://crm.corgiinvest.com/metadata');
  assert.match(request.calls[2]!.url, /\/rest\/companies\?/);
});

test('loads view visibility and creator ownership for safe adoption', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({ data: { objects: [] }, pageInfo: { hasNextPage: false } }),
    response({ data: { getViews: [], navigationMenuItems: [] } }),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-view-contract.json'),
    requestGate: immediateGate,
  });

  await api.listWorkspaceConfigSnapshot();

  const query = String((request.calls[1]?.data as { query?: unknown }).query);
  assert.match(query, /\bvisibility\b/);
  assert.match(query, /\bcreatedByUserWorkspaceId\b/);
});

test('projects relation targets and creates the exact wholesaler relation payload', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({
      data: {
        objects: [
          {
            id: 'wholesaler-object-id',
            nameSingular: 'wholesaler',
            namePlural: 'wholesalers',
            fields: [
              {
                id: 'workspace-member-relation-id',
                name: 'workspaceMember',
                label: 'Workspace Member',
                type: 'RELATION',
                settings: { relationType: 'MANY_TO_ONE' },
              },
            ],
          },
          {
            id: 'workspace-member-object-id',
            nameSingular: 'workspaceMember',
            namePlural: 'workspaceMembers',
            fields: [],
          },
        ],
      },
      pageInfo: { hasNextPage: false },
    }),
    response({
      components: {
        schemas: {
          WholesalerForResponse: {
            properties: {
              workspaceMember: {
                $ref: '#/components/schemas/WorkspaceMemberForResponse',
              },
            },
          },
        },
      },
    }),
    response({ data: { getViews: [], navigationMenuItems: [] } }),
    response({}, 201),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-workspace-config.json'),
    requestGate: immediateGate,
  });

  const snapshot = await api.listWorkspaceConfigSnapshot();
  assert.equal(
    snapshot.objects[0]?.fields[0]?.relationTargetObjectMetadataId,
    'workspace-member-object-id',
  );
  await api.createMetadataField({
    objectMetadataId: 'wholesaler-object-id',
    name: 'workspaceMember',
    label: 'Workspace Member',
    type: 'RELATION',
    relationCreationPayload: {
      targetObjectMetadataId: 'workspace-member-object-id',
      targetFieldLabel: 'Wholesaler Profiles',
      targetFieldIcon: 'IconUser',
      type: 'MANY_TO_ONE',
    },
  });
  assert.equal(
    request.calls[1]?.url,
    'https://crm.corgiinvest.com/rest/open-api/core',
  );
  assert.deepEqual(request.calls[3]?.data, {
    objectMetadataId: 'wholesaler-object-id',
    name: 'workspaceMember',
    label: 'Workspace Member',
    type: 'RELATION',
    relationCreationPayload: {
      targetObjectMetadataId: 'workspace-member-object-id',
      targetFieldLabel: 'Wholesaler Profiles',
      targetFieldIcon: 'IconUser',
      type: 'MANY_TO_ONE',
    },
    isLabelSyncedWithName: false,
  });
});

test('uses an updatedAt compare-and-set for each company projection', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({ data: { updateCompanies: [{ id: 'company-id' }] } }),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-workspace-config.json'),
    requestGate: immediateGate,
  });
  await api.conditionalPatchCompany('company-id', '2026-09-08T00:00:00.000Z', {
    stateRegion: 'IL',
    postalCode: '60601',
  });

  assert.equal(request.calls[0]?.method, 'PATCH');
  const decodedUrl = decodeURIComponent(request.calls[0]!.url);
  assert.match(decodedUrl, /id\[eq\]:"company-id"/);
  assert.match(decodedUrl, /updatedAt\[eq\]:"2026-09-08T00:00:00.000Z"/);
});

test('creates a deterministic workspace-owned Follow-ups view through metadata REST', async () => {
  const request = new FakeRequest();
  const view = {
    id: 'c0671000-0000-4000-8000-000000000001',
    universalIdentifier: 'c0671000-0000-4000-8000-000000000006',
    name: 'Follow-ups',
    objectMetadataId: 'outreach-object-id',
    type: 'TABLE' as const,
    icon: 'IconChecklist',
    position: 2,
    visibility: 'WORKSPACE' as const,
  };
  request.responses.push(
    response({
      ...view,
      createdByUserWorkspaceId: null,
    }),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-workspace-config.json'),
    requestGate: immediateGate,
  });

  await api.createView(view);

  assert.equal(request.calls[0]?.method, 'POST');
  assert.equal(
    request.calls[0]?.url,
    'https://crm.corgiinvest.com/rest/metadata/views',
  );
  assert.deepEqual(request.calls[0]?.data, view);
});

test('lists and compare-and-set updates wholesaler territory assignments', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({
      data: {
        wholesalers: [
          {
            id: 'grace-id',
            name: 'Grace Hopper',
            workspaceMember: {
              id: '11111111-1111-4111-8111-111111111111',
            },
            updatedAt: '2026-09-08T00:00:00.000Z',
            territory: null,
          },
        ],
      },
      pageInfo: { hasNextPage: false },
    }),
    response({ data: { updateWholesalers: [{ id: 'grace-id' }] } }),
  );
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    checkpointFilePath: join(tmpdir(), 'unused-workspace-config.json'),
    requestGate: immediateGate,
  });

  const wholesalers = await api.listWholesalers();
  await api.conditionalPatchWholesaler('grace-id', '2026-09-08T00:00:00.000Z', {
    territory: 'Chicago',
  });

  assert.equal(
    wholesalers[0]?.workspaceMember?.id,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.match(request.calls[0]!.url, /\/rest\/wholesalers\?.*depth=1/);
  assert.deepEqual(request.calls[1]?.data, { territory: 'Chicago' });
  const decodedUrl = decodeURIComponent(request.calls[1]!.url);
  assert.match(decodedUrl, /id\[eq\]:"grace-id"/);
  assert.match(decodedUrl, /updatedAt\[eq\]:"2026-09-08T00:00:00.000Z"/);
});

test('territory identity discovery API exposes only the read-only wholesaler query', async () => {
  const request = new FakeRequest();
  request.responses.push(
    response({
      data: {
        wholesalers: [
          {
            id: 'grace-id',
            name: { firstName: 'Grace', lastName: 'Hopper' },
            workspaceMember: {
              id: '11111111-1111-4111-8111-111111111111',
            },
            updatedAt: '2026-09-09T00:00:00.000Z',
          },
        ],
      },
      pageInfo: { hasNextPage: false },
    }),
  );
  const api = createTwentyTerritoryIdentityDiscoveryApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    requestGate: immediateGate,
  });

  assert.deepEqual(Object.keys(api), ['listWholesalers']);
  const wholesalers = await api.listWholesalers();
  assert.equal(
    wholesalers[0]?.workspaceMember?.id,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.deepEqual(
    request.calls.map(({ method }) => method),
    ['GET'],
  );
  assert.match(request.calls[0]!.url, /\/rest\/wholesalers\?.*depth=1/);
});

test('metadata bootstrap API exposes no record or layout mutations', () => {
  const request = new FakeRequest();
  const api = createTwentyWorkspaceMetadataBootstrapApi({
    request,
    backendBaseUrl: 'https://crm.corgiinvest.com',
    frontendBaseUrl: 'https://crm.corgiinvest.com',
    requestGate: immediateGate,
  });

  assert.deepEqual(Object.keys(api), [
    'listWorkspaceConfigSnapshot',
    'createMetadataField',
    'updateMetadataFieldLabel',
  ]);
  assert.deepEqual(request.calls, []);
});

test('writes and validates a PII-free integrity-protected checkpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-workspace-config-'));
  try {
    const checkpointPath = join(directory, 'artifacts', 'checkpoint.json');
    const approvedPath = await preflightWorkspaceConfigCheckpoint({
      runnerTemp: directory,
      checkpointPath,
    });
    const request = new FakeRequest();
    const api = createTwentyWorkspaceConfigApi({
      request,
      backendBaseUrl: 'https://crm.corgiinvest.com',
      frontendBaseUrl: 'https://crm.corgiinvest.com',
      checkpointFilePath: approvedPath,
      requestGate: immediateGate,
    });
    const checkpoint: WorkspaceConfigCheckpoint = {
      schemaVersion: 2,
      origin: 'https://crm.corgiinvest.com',
      expectedCompanyCount: 2191,
      companyIdentityHash: 'a'.repeat(64),
      sourceProjectionHash: 'b'.repeat(64),
      expectedProjectionHash: 'c'.repeat(64),
      wholesalerIdentityHash: 'e'.repeat(64),
      expectedTerritoryHash: 'f'.repeat(64),
      status: 'preflight',
      completedOperationHashes: ['d'.repeat(64)],
    };
    await api.writeCheckpoint(checkpoint);
    assert.deepEqual(await api.readCheckpoint(), checkpoint);
    const raw = await readFile(approvedPath, 'utf8');
    assert.equal(raw.includes('company-id'), false);
    assert.equal(raw.includes('60601'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
