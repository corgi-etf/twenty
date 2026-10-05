import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOwnershipManifest,
  applyOwnershipManifest,
  ownershipManifestDigest,
  type OwnershipBackfillApi,
  type OwnershipJournalEntry,
} from '../src/company-ownership-backfill.ts';
const source = () => ({
  companies: [
    {
      id: 'c1',
      updatedAt: '2026-10-05T12:00:00Z',
      accountOwnerId: 'm1',
      historicalOwnerId: null,
    },
  ],
  wholesalers: [{ id: 'w1', workspaceMemberId: 'm1' }],
  existingOwnerships: [] as Array<{
    id: string;
    companyId: string;
    wholesalerId: string;
    isPrimary: boolean;
    updatedAt: string;
    deletedAt: string | null;
  }>,
});
const fixture = () => {
  const snapshot = source();
  const manifest = buildOwnershipManifest({
    snapshot,
    workspaceId: 'workspace',
    expectedCompanyCount: 1,
  });
  const journal: OwnershipJournalEntry[] = [];
  let writes = 0;
  const api: OwnershipBackfillApi = {
    readSnapshot: async () => structuredClone(snapshot),
    readCompany: async () => structuredClone(snapshot.companies[0]!),
    readWholesalers: async () => structuredClone(snapshot.wholesalers),
    readOwnerships: async () => structuredClone(snapshot.existingOwnerships),
    createOwnership: async (input) => {
      writes++;
      const row = {
        ...input,
        updatedAt: '2026-10-05T13:00:00Z',
        deletedAt: null,
      };
      snapshot.existingOwnerships.push(row);
      return row;
    },
  };
  const apply = () =>
    applyOwnershipManifest({
      api,
      manifest,
      reviewedDigest: ownershipManifestDigest(manifest),
      workspaceId: 'workspace',
      journal,
      appendJournal: async (row) => {
        journal.push(row);
      },
    });
  return { snapshot, manifest, journal, api, apply, writes: () => writes };
};
test('requires reviewed digest and tenant before any write', async () => {
  const f = fixture();
  await assert.rejects(
    applyOwnershipManifest({
      api: f.api,
      manifest: f.manifest,
      reviewedDigest: 'wrong',
      workspaceId: 'workspace',
      journal: [],
      appendJournal: async () => {},
    }),
    /digest/,
  );
  assert.equal(f.writes(), 0);
});
test('records intent and durable insertion result and resumes without duplicates', async () => {
  const f = fixture();
  await f.apply();
  assert.deepEqual(
    f.journal.map((entry) => entry.kind),
    ['intent', 'created', 'confirmed'],
  );
  assert.equal(f.writes(), 1);
  await f.apply();
  assert.equal(f.writes(), 1);
});
test('stops before writing when source ownership changed', async () => {
  const f = fixture();
  f.api.readCompany = async () => ({
    ...f.snapshot.companies[0]!,
    accountOwnerId: 'different',
  });
  await assert.rejects(f.apply(), /source changed/);
  assert.equal(f.writes(), 0);
});
test('never resurrects a deleted link or overwrites a staff junction', async () => {
  const f = fixture();
  f.api.readOwnerships = async () => [
    {
      ...f.manifest.preview.additions[0]!,
      updatedAt: '2026-10-05T13:00:00Z',
      deletedAt: '2026-10-05T13:01:00Z',
    },
  ];
  await assert.rejects(f.apply(), /junctions changed/);
  assert.equal(f.writes(), 0);
});
test('journals a successful insert before aborting on a concurrent parent change', async () => {
  const f = fixture();
  const create = f.api.createOwnership;
  f.api.createOwnership = async (row) => {
    const result = await create(row);
    f.snapshot.companies[0]!.updatedAt = '2026-10-05T14:00:00Z';
    return result;
  };
  await assert.rejects(f.apply(), /ambiguous post-check/);
  assert.deepEqual(
    f.journal.map((entry) => entry.kind),
    ['intent', 'created', 'ambiguous'],
  );
  assert.equal(f.snapshot.existingOwnerships.length, 1);
  await assert.rejects(f.apply(), /ambiguous/);
});
test('fails closed after an uncertain write and never retries its intent automatically', async () => {
  const f = fixture();
  f.api.createOwnership = async () => {
    throw new Error('Lost response');
  };
  await assert.rejects(f.apply(), /Lost response/);
  await assert.rejects(f.apply(), /unconfirmed|ambiguous/i);
});
test('rejects ambiguous mapping plans instead of applying a partial plan', async () => {
  const f = fixture();
  const snapshot = source();
  snapshot.wholesalers.push({ id: 'w2', workspaceMemberId: 'm1' });
  const manifest = buildOwnershipManifest({
    snapshot,
    workspaceId: 'workspace',
    expectedCompanyCount: 1,
  });
  await assert.rejects(
    applyOwnershipManifest({
      api: f.api,
      manifest,
      workspaceId: 'workspace',
      reviewedDigest: ownershipManifestDigest(manifest),
      journal: [],
      appendJournal: async () => {},
    }),
    /manual review/,
  );
  assert.equal(f.writes(), 0);
});
