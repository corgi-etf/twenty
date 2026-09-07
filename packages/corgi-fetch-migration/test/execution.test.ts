import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPlan,
  rollback,
  verifyPlan,
  type ExistingRecord,
  type FrozenMigrationPlan,
  type MigrationApi,
} from '../src/execution.ts';
import { sealPlan } from '../src/integrity.ts';

class FakeApi implements MigrationApi {
  records = new Map<string, ExistingRecord>();
  batches: Array<{ objectPlural: string; size: number }> = [];
  inFlight = 0;
  maxInFlight = 0;
  getCalls = 0;

  key(objectPlural: string, id: string) {
    return `${objectPlural}:${id}`;
  }

  async listAll(objectPlural: string) {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(`${objectPlural}:`))
      .map(([, record]) => structuredClone(record));
  }

  async batchUpsert(objectPlural: string, records: Record<string, unknown>[]) {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    for (const record of records) {
      this.records.set(this.key(objectPlural, record.id as string), {
        ...(this.records.get(this.key(objectPlural, record.id as string)) ??
          {}),
        ...structuredClone(record),
        id: record.id as string,
      });
    }
    this.batches.push({ objectPlural, size: records.length });
    this.inFlight -= 1;
  }

  async getOne(objectPlural: string, id: string) {
    this.getCalls += 1;
    const record = this.records.get(this.key(objectPlural, id));
    if (!record) throw new Error('not found');
    return structuredClone(record);
  }

  async patchOne(
    objectPlural: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    this.records.set(this.key(objectPlural, id), {
      id,
      ...structuredClone(data),
    });
  }

  async softDeleteOne(objectPlural: string, id: string) {
    this.records.delete(this.key(objectPlural, id));
  }
}

const makePlan = (count: number): FrozenMigrationPlan => {
  const body = {
    formatVersion: 1 as const,
    migrationRunId: 'run-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    records: Array.from({ length: count }, (_, index) => ({
      objectPlural: 'companies',
      sourceId: `source-${index}`,
      targetId: `id-${index}`,
      payload: {
        id: `id-${index}`,
        legacyFetchId: `source-${index}`,
        migrationRunId: 'run-1',
        sourceRowHmac: `hash-${index}`,
        name: `Company ${index}`,
      },
    })),
    warnings: [],
    invitationPlan: [],
  };

  return sealPlan(body);
};

test('apply is idempotent, batches at 100, and uses no more than two requests concurrently', async () => {
  const api = new FakeApi();
  const plan = makePlan(250);
  const manifest = await applyPlan(plan, api, new Date('2026-02-01T00:00:00Z'));

  assert.deepEqual(
    api.batches.map(({ size }) => size),
    [100, 100, 50],
  );
  assert.equal(api.maxInFlight, 2);
  assert.equal(manifest.mutations.length, 250);
  assert.ok(manifest.mutations.every(({ action }) => action === 'created'));

  api.batches = [];
  const secondManifest = await applyPlan(plan, api);
  assert.deepEqual(api.batches, []);
  assert.deepEqual(secondManifest.mutations, []);
});

test('apply rejects deterministic ID and external key collisions before writing', async () => {
  const api = new FakeApi();
  const plan = makePlan(1);
  api.records.set('companies:id-0', {
    id: 'id-0',
    legacyFetchId: 'somebody-else',
  });

  await assert.rejects(() => applyPlan(plan, api), /collision/i);
  assert.deepEqual(api.batches, []);
});

test('verify compares both external identity and row HMAC', async () => {
  const api = new FakeApi();
  const plan = makePlan(2);
  await applyPlan(plan, api);
  assert.deepEqual(await verifyPlan(plan, api), { verified: 2 });
  assert.equal(
    api.getCalls,
    0,
    'verification should paginate instead of issuing one request per row',
  );

  api.records.get('companies:id-1')!.sourceRowHmac = 'drifted';
  await assert.rejects(() => verifyPlan(plan, api), /verification.*id-1/i);
});

test('rollback reverses creations but refuses to overwrite post-migration changes', async () => {
  const api = new FakeApi();
  const plan = makePlan(2);
  const manifest = await applyPlan(plan, api);
  api.records.get('companies:id-1')!.name = 'edited after migration';

  await assert.rejects(() => rollback(manifest, api), /hash guard/i);
  assert.equal(api.records.size, 2);

  api.records.get('companies:id-1')!.name = 'Company 1';
  assert.deepEqual(await rollback(manifest, api), { rolledBack: 2 });
  assert.equal(api.records.size, 0);
});
