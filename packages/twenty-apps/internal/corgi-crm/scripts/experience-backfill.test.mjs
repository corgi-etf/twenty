import { readFile } from 'node:fs/promises';
import { buildSchema, parse, validate } from 'graphql';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExperienceBackfill,
  validateBackfillManifest,
} from './experience-backfill.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const updatedAt = '2026-10-05T12:00:00Z';
const activity = {
  id,
  name: ' UnTiTlEd ',
  activityType: 'PHONE_CALL',
  occurredAt: '2026-10-05T01:00:00Z',
  createdAt: updatedAt,
  updatedAt,
  companyId,
  company: { name: 'Example' },
};
test('previews only blank title variants and valid historical allocations without inferring heldAt', () => {
  const manifest = buildExperienceBackfill({
    workspaceId,
    now: updatedAt,
    activities: [activity, { ...activity, id: companyId, name: 'Custom call' }],
    allocations: [
      {
        id: companyId,
        companyId,
        ticker: 'ACME',
        amount: { amountMicros: 1000000, currencyCode: 'USD' },
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt,
        loggedAt: null,
      },
    ],
  });
  assert.equal(manifest.operations.length, 2);
  assert.equal(
    manifest.operations[1].after.name,
    'Phone call - Example - 2026-10-04',
  );
  assert.equal(
    manifest.operations[0].after.loggedAt,
    '2026-09-01T12:00:00.000Z',
  );
  assert.ok(!JSON.stringify(manifest).includes('heldAt'));
});
test('rejects an altered manifest or wrong workspace before execution', () => {
  const manifest = buildExperienceBackfill({
    workspaceId,
    now: updatedAt,
    activities: [activity],
    allocations: [],
  });
  assert.doesNotThrow(() =>
    validateBackfillManifest(manifest, workspaceId, manifest.digest),
  );
  assert.throws(
    () =>
      validateBackfillManifest(
        { ...manifest, workspaceId: id },
        workspaceId,
        manifest.digest,
      ),
    /workspace|digest/,
  );
  assert.throws(
    () => validateBackfillManifest(manifest, id, manifest.digest),
    /workspace|digest/,
  );
});
test('maintenance metadata documents match the deployed API schema', async () => {
  const source = await readFile(
    new URL('./experience-backfill.mjs', import.meta.url),
    'utf8',
  );
  const schema = buildSchema(
    await readFile(
      new URL(
        '../../../../twenty-client-sdk/src/metadata/generated/schema.graphql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const operation of [
    'BackfillIdentity',
    'ApproveBackfill',
    'ExecuteBackfill',
  ]) {
    const document = [...source.matchAll(/`((?:query|mutation) [^`]+)`/g)]
      .map((match) => match[1])
      .find((value) => value.includes(operation));
    assert.ok(document, `Missing ${operation}`);
    assert.deepEqual(validate(schema, parse(document)), [], operation);
  }
});
