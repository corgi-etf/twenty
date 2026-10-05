import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCompanyTypeInventory,
  readCompanyTypeInventory,
} from '../src/company-type-inventory.ts';
import {
  createWorkspaceConfigRequestGate,
  type WorkspaceConfigRequestContext,
} from '../src/twenty-api.ts';

test('reports distinct raw values and unmapped review without rewriting source data', () => {
  const companies = [
    { id: '1', firmType: 'RIA' },
    { id: '2', firmType: 'RIA' },
    { id: '3', firmType: ' ria ' },
    { id: '4', firmType: 'Bank / RIA hybrid' },
    { id: '5', firmType: null },
  ];
  const original = structuredClone(companies);
  const inventory = buildCompanyTypeInventory(companies, 5);
  assert.equal(inventory.companyCount, 5);
  assert.equal(inventory.emptyCount, 1);
  assert.equal(
    inventory.values.find(({ rawValue }) => rawValue === 'RIA')?.count,
    2,
  );
  assert.equal(
    inventory.values.find(({ rawValue }) => rawValue === ' ria ')?.category,
    'ria',
  );
  assert.deepEqual(inventory.unmapped, [
    { rawValue: 'Bank / RIA hybrid', count: 1 },
  ]);
  assert.deepEqual(companies, original);
});
test('rejects incomplete or duplicate source inventories', () => {
  assert.throws(
    () => buildCompanyTypeInventory([{ id: '1', firmType: 'bank' }], 2),
    /coverage/,
  );
  assert.throws(
    () => buildCompanyTypeInventory([{ id: '1' }, { id: '1' }], 2),
    /coverage/,
  );
});
test('reads all pages through query-only requests and verifies the final count', async () => {
  const pages = [
    {
      edges: [{ node: { id: '1', firmType: 'RIA' } }],
      totalCount: 2,
      pageInfo: { hasNextPage: true, endCursor: 'cursor' },
    },
    {
      edges: [{ node: { id: '2', firmType: 'Unknown' } }],
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    { totalCount: 2 },
  ];
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
        json: async () => ({ data: { companies: pages.shift() } }),
      };
    },
  } as unknown as WorkspaceConfigRequestContext;
  const inventory = await readCompanyTypeInventory({
    request,
    expectedCompanyCount: 2,
    requestGate: createWorkspaceConfigRequestGate({ minimumIntervalMs: 0 }),
  });
  assert.equal(inventory.companyCount, 2);
  assert.deepEqual(inventory.unmapped, [{ rawValue: 'Unknown', count: 1 }]);
  assert.equal(requests[1]!.variables.after, 'cursor');
  assert.ok(requests.every(({ query }) => /^query\b/.test(query)));
  assert.ok(requests.every(({ query }) => !query.includes('mutation')));
});

test('rejects a broken page cursor or a changed final count instead of reporting partial coverage', async () => {
  const cases = [
    {
      pages: [
        {
          edges: [{ node: { id: '1', firmType: 'RIA' } }],
          totalCount: 1,
          pageInfo: { hasNextPage: true, endCursor: null },
        },
      ],
      error: /cursor is invalid/,
    },
    {
      pages: [
        {
          edges: [{ node: { id: '1', firmType: 'RIA' } }],
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        { totalCount: 2 },
      ],
      error: /count changed after pagination/,
    },
  ];
  for (const { pages, error } of cases) {
    const request = {
      post: async () => ({
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        dispose: async () => {},
        json: async () => ({ data: { companies: pages.shift() } }),
      }),
    } as unknown as WorkspaceConfigRequestContext;
    await assert.rejects(
      readCompanyTypeInventory({
        request,
        expectedCompanyCount: 1,
        requestGate: createWorkspaceConfigRequestGate({ minimumIntervalMs: 0 }),
      }),
      error,
    );
  }
});
