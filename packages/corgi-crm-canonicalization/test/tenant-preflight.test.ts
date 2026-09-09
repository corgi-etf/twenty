import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCanonicalizationRequestGate } from '../src/request-gate.ts';
import {
  assertCanonicalizationTenant,
  CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
  CANONICALIZATION_APPROVED_WORKSPACE_ID,
} from '../src/tenant-preflight.ts';
import type {
  CanonicalizationRequestContext,
  CanonicalizationResponse,
} from '../src/twenty-rest-api.ts';

class TenantRequest implements CanonicalizationRequestContext {
  calls: Array<{ url: string; data: unknown }> = [];
  readonly response: CanonicalizationResponse;

  constructor(responseValue: CanonicalizationResponse) {
    this.response = responseValue;
  }

  async post(
    url: string,
    options: { headers: Record<string, string>; data?: unknown },
  ) {
    this.calls.push({ url, data: options.data });
    return this.response;
  }

  async get(): Promise<CanonicalizationResponse> {
    throw new Error('unexpected REST request');
  }

  async patch(): Promise<CanonicalizationResponse> {
    throw new Error('unexpected REST mutation');
  }
}

const response = (body: unknown): CanonicalizationResponse => ({
  status: () => 200,
  ok: () => true,
  headers: () => ({}),
  json: async () => body,
  dispose: async () => undefined,
});

const immediateGate = createCanonicalizationRequestGate({
  minimumIntervalMs: 0,
});

test('tenant preflight accepts only the expected non-impersonated metadata role', async () => {
  const request = new TenantRequest(
    response({
      data: {
        currentUser: {
          currentWorkspace: {
            id: CANONICALIZATION_APPROVED_WORKSPACE_ID,
            displayName: 'Corgi ETF',
          },
          currentUserWorkspace: {
            id: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
            permissionFlags: ['DATA_MODEL'],
            isImpersonating: false,
          },
        },
        getRoles: [
          {
            canUpdateAllSettings: true,
            canReadAllObjectRecords: true,
            canUpdateAllObjectRecords: true,
            workspaceMembers: [
              {
                userWorkspaceId: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
              },
            ],
          },
        ],
      },
    }),
  );

  await assertCanonicalizationTenant({
    request,
    requestGate: immediateGate,
    origin: 'https://crm.corgiinvest.com',
    expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
  });

  assert.equal(request.calls.length, 1);
  assert.equal(request.calls[0]?.url, 'https://crm.corgiinvest.com/metadata');
});

test('wrong workspace and non-admin sessions fail without a mutation', async () => {
  for (const currentUser of [
    {
      currentWorkspace: {
        id: '223e4567-e89b-42d3-a456-426614174000',
        displayName: 'Wrong Workspace',
      },
      currentUserWorkspace: {
        id: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
        permissionFlags: ['DATA_MODEL'],
        isImpersonating: false,
      },
    },
    {
      currentWorkspace: {
        id: CANONICALIZATION_APPROVED_WORKSPACE_ID,
        displayName: 'Corgi ETF',
      },
      currentUserWorkspace: {
        id: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
        permissionFlags: ['VIEWS'],
        isImpersonating: false,
      },
    },
  ]) {
    const request = new TenantRequest(
      response({
        data: {
          currentUser,
          getRoles: [
            {
              canUpdateAllSettings: true,
              canReadAllObjectRecords: true,
              canUpdateAllObjectRecords: true,
              workspaceMembers: [
                {
                  userWorkspaceId: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
                },
              ],
            },
          ],
        },
      }),
    );
    await assert.rejects(
      assertCanonicalizationTenant({
        request,
        requestGate: immediateGate,
        origin: 'https://crm.corgiinvest.com',
        expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
      }),
      /workspace is not approved|lacks metadata permission/,
    );
    assert.equal(request.calls.length, 1);
    const requestData = request.calls[0]?.data as { query?: unknown };
    assert.match(String(requestData.query), /^query /);
    assert.equal(String(requestData.query).includes('mutation'), false);
  }
});

test('a DATA_MODEL-only custom role fails before any REST mutation', async () => {
  for (const capabilities of [
    {
      canUpdateAllSettings: false,
      canReadAllObjectRecords: true,
      canUpdateAllObjectRecords: true,
    },
    {
      canUpdateAllSettings: true,
      canReadAllObjectRecords: false,
      canUpdateAllObjectRecords: true,
    },
    {
      canUpdateAllSettings: true,
      canReadAllObjectRecords: true,
      canUpdateAllObjectRecords: false,
    },
  ]) {
    const request = new TenantRequest(
      response({
        data: {
          currentUser: {
            currentWorkspace: {
              id: CANONICALIZATION_APPROVED_WORKSPACE_ID,
              displayName: 'Corgi ETF',
            },
            currentUserWorkspace: {
              id: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
              permissionFlags: ['DATA_MODEL'],
              isImpersonating: false,
            },
          },
          getRoles: [
            {
              ...capabilities,
              workspaceMembers: [
                {
                  userWorkspaceId: CANONICALIZATION_APPROVED_USER_WORKSPACE_ID,
                },
              ],
            },
          ],
        },
      }),
    );

    await assert.rejects(
      assertCanonicalizationTenant({
        request,
        requestGate: immediateGate,
        origin: 'https://crm.corgiinvest.com',
        expectedWorkspaceId: CANONICALIZATION_APPROVED_WORKSPACE_ID,
      }),
      /not an admin/,
    );
    assert.equal(request.calls.length, 1);
  }
});
