import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOwnershipBackfillApi } from '../src/company-ownership-api.ts';
import {
  createWorkspaceConfigRequestGate,
  type WorkspaceConfigRequestContext,
} from '../src/twenty-api.ts';
const make = (pages: unknown[]) => {
  const requests: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const request = {
    post: async (
      _url: string,
      options: { data: { query: string; variables: Record<string, unknown> } },
    ) => {
      requests.push(options.data);
      return {
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        dispose: async () => {},
        json: async () => ({ data: { companyOwnerships: pages.shift() } }),
      };
    },
  } as unknown as WorkspaceConfigRequestContext;
  const api = createOwnershipBackfillApi({
    request,
    requestGate: createWorkspaceConfigRequestGate({ minimumIntervalMs: 0 }),
  });
  return { api, requests };
};
const page = (
  ids: string[],
  totalCount: number,
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  edges: ids.map((id) => ({ node: { id } })),
  pageInfo: { hasNextPage, endCursor },
  totalCount,
});
test('collects every page including tombstones and verifies the final count', async () => {
  const f = make([
    page(['a'], 2, true, 'cursor'),
    page(['b'], 2),
    page(['a'], 2),
  ]);
  assert.equal((await f.api.readOwnerships('company')).length, 2);
  assert.deepEqual(f.requests[0]!.variables.filter, {
    and: [
      {
        or: [{ deletedAt: { is: 'NULL' } }, { deletedAt: { is: 'NOT_NULL' } }],
      },
      { companyId: { eq: 'company' } },
    ],
  });
  assert.equal(f.requests[1]!.variables.after, 'cursor');
  assert.equal(f.requests[2]!.variables.first, 1);
});
test('rejects duplicates, cycles, omitted pages, and count changes', async () => {
  for (const pages of [
    [page(['a'], 2, true, 'same'), page(['a'], 2)],
    [page(['a'], 3, true, 'same'), page(['b'], 3, true, 'same')],
    [page(['a'], 2)],
    [page(['a'], 1), page(['a'], 2)],
  ])
    await assert.rejects(
      make(pages).api.readOwnerships('company'),
      /inventory/,
    );
});
test('combines complete guard inventories in one request without dropping deleted links', async () => {
  let calls = 0;
  const request = {
    post: async (
      _url: string,
      options: { data: { query: string; variables: Record<string, unknown> } },
    ) => {
      calls++;
      assert.match(options.data.query, /OwnershipGuard/);
      assert.deepEqual(options.data.variables.ownerships, {
        and: [
          {
            or: [
              { deletedAt: { is: 'NULL' } },
              { deletedAt: { is: 'NOT_NULL' } },
            ],
          },
          { companyId: { eq: 'company' } },
        ],
      });
      return {
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        dispose: async () => {},
        json: async () => ({
          data: {
            companies: page(['company'], 1),
            wholesalers: page(['wholesaler'], 1),
            companyOwnerships: page(['tombstone'], 1),
          },
        }),
      };
    },
  } as unknown as WorkspaceConfigRequestContext;
  const api = createOwnershipBackfillApi({
    request,
    requestGate: createWorkspaceConfigRequestGate({ minimumIntervalMs: 0 }),
  });
  const state = await api.readGuardState!('company');
  assert.equal(calls, 1);
  assert.equal(state.company.id, 'company');
  assert.equal(state.ownerships[0]?.id, 'tombstone');
});
test('exhausts large guard collections instead of trusting the first page', async () => {
  let calls = 0;
  const request = {
    post: async (
      _url: string,
      options: { data: { query: string; variables: Record<string, unknown> } },
    ) => {
      calls++;
      const data = options.data.query.includes('OwnershipGuard')
        ? {
            companies: page(['company'], 1),
            wholesalers: page(['first'], 2, true, 'next'),
            companyOwnerships: page([], 0),
          }
        : {
            wholesalers:
              options.data.variables.first === 1
                ? page(['first'], 2)
                : options.data.variables.after
                  ? page(['last'], 2)
                  : page(['first'], 2, true, 'next'),
          };
      return {
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        dispose: async () => {},
        json: async () => ({ data }),
      };
    },
  } as unknown as WorkspaceConfigRequestContext;
  const api = createOwnershipBackfillApi({
    request,
    requestGate: createWorkspaceConfigRequestGate({ minimumIntervalMs: 0 }),
  });
  const state = await api.readGuardState!('company');
  assert.deepEqual(
    state.wholesalers.map(({ id }) => id),
    ['first', 'last'],
  );
  assert.equal(calls, 4);
});
