import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkRecords } from '../src/batching.ts';
import { deterministicId } from '../src/deterministic-id.ts';
import {
  assertPlanIntegrity,
  canonicalJson,
  sealPlan,
  sourceRowHmac,
} from '../src/integrity.ts';
import { buildPlan, type MinimalSnapshot } from '../src/planner.ts';

test('deterministicId returns a stable RFC 4122 version 5 UUID per source key', () => {
  const id = deterministicId('company', 'legacy-123');

  assert.equal(id, deterministicId('company', 'legacy-123'));
  assert.notEqual(id, deterministicId('person', 'legacy-123'));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('canonicalJson and HMAC are insensitive to object key ordering', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(
    sourceRowHmac({ b: 2, a: 1 }, 'test-key'),
    sourceRowHmac({ a: 1, b: 2 }, 'test-key'),
  );
});

test('sealed plans reject any mutation', () => {
  const plan = sealPlan({ records: [{ id: 'one' }] });
  assert.doesNotThrow(() => assertPlanIntegrity(plan));

  plan.records[0]!.id = 'tampered';
  assert.throws(() => assertPlanIntegrity(plan), /hash/i);
});

test('chunkRecords enforces the API maximum and never emits empty batches', () => {
  const records = Array.from({ length: 201 }, (_, index) => index);

  assert.deepEqual(chunkRecords(records).map((batch) => batch.length), [100, 100, 1]);
  assert.deepEqual(chunkRecords([]), []);
  assert.throws(() => chunkRecords(records, 101), /100/);
});

test('planning preserves duplicate companies and deterministically chooses email and domain holders', () => {
  const snapshot: MinimalSnapshot = {
    companies: [
      { id: 'b', name: 'Acme II', normalized_name: 'acme', website: 'https://acme.example' },
      { id: 'a', name: 'Acme', normalized_name: 'acme', website: 'acme.example' },
    ],
    contacts: [
      { id: 'z', company_id: 'b', first_name: 'Zed', email: 'SAME@example.com' },
      { id: 'c', company_id: 'a', first_name: 'Cee', email: 'same@example.com' },
    ],
  };

  const plan = buildPlan(snapshot, { migrationRunId: 'run-1', hmacKey: 'key' });
  const companies = plan.records.filter(({ objectPlural }) => objectPlural === 'companies');
  const people = plan.records.filter(({ objectPlural }) => objectPlural === 'people');

  assert.equal(companies.length, 2);
  assert.equal(people.length, 2);
  assert.deepEqual(
    companies.map(({ sourceId }) => sourceId),
    ['a', 'b'],
  );
  assert.deepEqual(companies[0]!.payload.domainName, {
    primaryLinkLabel: 'acme.example',
    primaryLinkUrl: 'https://acme.example',
    secondaryLinks: [],
  });
  assert.equal(companies[1]!.payload.domainName, undefined);
  assert.deepEqual(people[0]!.payload.emails, {
    primaryEmail: 'same@example.com',
    additionalEmails: [],
  });
  assert.equal(people[1]!.payload.emails, undefined);
  assert.equal(people[1]!.payload.legacyEmail, 'same@example.com');
  assert.deepEqual(
    plan.warnings.map(({ code }) => code).sort(),
    ['COMPANY_DOMAIN_COLLISION', 'COMPANY_NAME_COLLISION', 'PERSON_EMAIL_COLLISION'],
  );

  const reversed = buildPlan(
    {
      companies: [...snapshot.companies].reverse(),
      contacts: [...snapshot.contacts].reverse(),
    },
    { migrationRunId: 'run-1', hmacKey: 'key' },
  );
  assert.deepEqual(reversed, plan);
});
