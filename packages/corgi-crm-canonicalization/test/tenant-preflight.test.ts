import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCanonicalizationRequestGate } from '../src/request-gate.ts';
import { assertCanonicalizationTenant } from '../src/tenant-preflight.ts';
import type {
  CanonicalizationRequestContext,
  CanonicalizationResponse,
} from '../src/twenty-rest-api.ts';

const EXPECTED_WORKSPACE_ID = '123e4567-e89b-42d3-a456-426614174000';

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
            id: EXPECTED_WORKSPACE_ID,
            displayName: 'Corgi ETF',
          },
          currentUserWorkspace: {
            permissionFlags: ['DATA_MODEL'],
            isImpersonating: false,
          },
        },
      },
    }),
  );

  await assertCanonicalizationTenant({
    request,
    requestGate: immediateGate,
    origin: 'https://crm.corgiinvest.com',
    expectedWorkspaceId: EXPECTED_WORKSPACE_ID,
  });

  assert.equal(request.calls.length, 1);
  assert.equal(request.calls[0]?.url, 'https://crm.corgiinvest.com/graphql');
});

test('wrong workspace and non-admin sessions fail without a mutation', async () => {
  for (const currentUser of [
    {
      currentWorkspace: {
        id: '223e4567-e89b-42d3-a456-426614174000',
        displayName: 'Wrong Workspace',
      },
      currentUserWorkspace: {
        permissionFlags: ['DATA_MODEL'],
        isImpersonating: false,
      },
    },
    {
      currentWorkspace: {
        id: EXPECTED_WORKSPACE_ID,
        displayName: 'Corgi ETF',
      },
      currentUserWorkspace: {
        permissionFlags: ['VIEWS'],
        isImpersonating: false,
      },
    },
  ]) {
    const request = new TenantRequest(response({ data: { currentUser } }));
    await assert.rejects(
      assertCanonicalizationTenant({
        request,
        requestGate: immediateGate,
        origin: 'https://crm.corgiinvest.com',
        expectedWorkspaceId: EXPECTED_WORKSPACE_ID,
      }),
      /workspace is not approved|lacks metadata permission/,
    );
    assert.equal(request.calls.length, 1);
    const requestData = request.calls[0]?.data as { query?: unknown };
    assert.match(String(requestData.query), /^query /);
    assert.equal(String(requestData.query).includes('mutation'), false);
  }
});
