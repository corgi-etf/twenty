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
import { migrationSourceHmac } from '../src/transform-contract.ts';

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
  assert.equal(secondManifest.mutations.length, 250);
  assert.ok(
    secondManifest.mutations.every(({ action }) => action === 'created'),
  );
});

test('apply checkpoints rollback coverage before writes and resumes an interrupted run', async () => {
  const api = new FakeApi();
  const plan = makePlan(2);
  let checkpoint: Awaited<ReturnType<typeof applyPlan>> | undefined;
  let shouldFail = true;
  const batchUpsert = api.batchUpsert.bind(api);
  api.batchUpsert = async (objectPlural, records) => {
    await batchUpsert(objectPlural, records);
    if (shouldFail) throw new Error('simulated interruption after write');
  };

  await assert.rejects(
    () =>
      applyPlan(plan, api, new Date('2026-02-01T00:00:00Z'), {
        checkpoint: async (manifest) => {
          checkpoint = structuredClone(manifest);
        },
      }),
    /simulated interruption/,
  );
  assert.equal(checkpoint?.status, 'applying');
  assert.equal(checkpoint?.mutations.length, 2);

  shouldFail = false;
  const resumed = await applyPlan(plan, api, undefined, {
    resumeManifest: checkpoint,
  });
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.mutations.length, 2);
  assert.ok(
    resumed.mutations.every(({ appliedPayloadHash }) => appliedPayloadHash),
  );
  assert.deepEqual(await rollback(resumed, api), { rolledBack: 2 });
});

test('rollback refuses an incomplete apply checkpoint', async () => {
  const api = new FakeApi();
  const plan = makePlan(1);
  let checkpoint: Awaited<ReturnType<typeof applyPlan>> | undefined;
  api.batchUpsert = async () => {
    throw new Error('simulated interruption');
  };

  await assert.rejects(() =>
    applyPlan(plan, api, undefined, {
      checkpoint: async (manifest) => {
        checkpoint = structuredClone(manifest);
      },
    }),
  );
  await assert.rejects(() => rollback(checkpoint!, api), /incomplete/i);
});

test('resume retains the original before-image for an interrupted update', async () => {
  const api = new FakeApi();
  const plan = makePlan(1);
  api.records.set('companies:id-0', {
    id: 'id-0',
    legacyFetchId: 'source-0',
    migrationRunId: 'older-run',
    sourceRowHmac: 'older-hash',
    name: 'Original name',
  });
  let checkpoint: Awaited<ReturnType<typeof applyPlan>> | undefined;
  const batchUpsert = api.batchUpsert.bind(api);
  api.batchUpsert = async (objectPlural, records) => {
    await batchUpsert(objectPlural, records);
    throw new Error('simulated interruption after update');
  };

  await assert.rejects(() =>
    applyPlan(plan, api, undefined, {
      checkpoint: async (manifest) => {
        checkpoint = structuredClone(manifest);
      },
    }),
  );
  api.batchUpsert = batchUpsert;

  const resumed = await applyPlan(plan, api, undefined, {
    resumeManifest: checkpoint,
  });
  assert.equal(resumed.mutations[0]?.action, 'updated');
  assert.equal(resumed.mutations[0]?.before?.name, 'Original name');
  await rollback(resumed, api);
  assert.equal(api.records.get('companies:id-0')?.name, 'Original name');
});

test('apply reconstructs changed records already created by the same run', async () => {
  const api = new FakeApi();
  const plan = makePlan(1);
  api.records.set('companies:id-0', {
    id: 'id-0',
    legacyFetchId: 'source-0',
    migrationRunId: 'run-1',
    sourceRowHmac: 'hash-from-earlier-plan',
    name: 'Earlier transformed value',
  });

  const manifest = await applyPlan(plan, api);
  assert.equal(manifest.mutations[0]?.action, 'created');
  assert.equal(manifest.mutations[0]?.before, undefined);
  await rollback(manifest, api);
  assert.equal(api.records.size, 0);
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

test('apply rejects any oversized record before its first destination request', async () => {
  const api = new FakeApi();
  const plan = makePlan(2);
  plan.records[1]!.objectPlural = 'importBatches';
  plan.records[1]!.payload.rawData = 'x'.repeat(100);
  const resealedPlan = sealPlan({
    ...plan,
    planHash: undefined,
  }) as FrozenMigrationPlan;

  await assert.rejects(
    () => applyPlan(resealedPlan, api, undefined, { maxBatchBodyBytes: 80 }),
    /single record.*exceeds.*byte/i,
  );
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

test('transform-only changes are reapplied when the contract version changes', async () => {
  const api = new FakeApi();
  const sourceRow = { id: 'source-0', name: 'Unchanged source' };
  const makeVersionedPlan = (
    transformVersion: string,
    transformedName: string,
  ): FrozenMigrationPlan => {
    const body = {
      formatVersion: 1 as const,
      migrationRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      records: [
        {
          objectPlural: 'companies',
          sourceId: sourceRow.id,
          targetId: 'id-0',
          payload: {
            id: 'id-0',
            legacyFetchId: sourceRow.id,
            migrationRunId: 'run-1',
            sourceRowHmac: migrationSourceHmac(
              sourceRow,
              'key',
              transformVersion,
            ),
            name: transformedName,
          },
        },
      ],
      warnings: [],
      invitationPlan: [],
    };

    return sealPlan(body);
  };

  await applyPlan(makeVersionedPlan('transform-v1', 'Old transform'), api);
  api.batches = [];
  const manifest = await applyPlan(
    makeVersionedPlan('transform-v2', 'New transform'),
    api,
  );

  assert.equal(api.batches.length, 1);
  assert.equal(api.records.get('companies:id-0')?.name, 'New transform');
  assert.equal(manifest.mutations[0]?.action, 'created');
});

test('manifest-backed verify rejects migration ownership and payload drift', async () => {
  const api = new FakeApi();
  const plan = makePlan(1);
  const manifest = await applyPlan(plan, api);
  const record = api.records.get('companies:id-0')!;

  record.name = 'edited after apply';
  await assert.rejects(() => verifyPlan(plan, api, manifest), /payload.*id-0/i);

  record.name = 'Company 0';
  record.migrationRunId = 'some-other-run';
  await assert.rejects(
    () => verifyPlan(plan, api, manifest),
    /verification.*id-0/i,
  );
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
