import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalContentKey,
  canonicalRowKey,
  normalizeEmail,
  normalizeLinkedIn,
  normalizePhone,
  stableStringify,
} from '../src/normalization.ts';

test('stable serialization and row keys ignore object insertion order', () => {
  const left = { b: [' two ', { z: 1, a: true }], a: ' One ' };
  const right = { a: ' One ', b: [' two ', { a: true, z: 1 }] };

  assert.equal(stableStringify(left), stableStringify(right));
  assert.equal(
    canonicalRowKey({
      sourceFile: 'Book.xlsx',
      sourceSheet: 'A',
      sourceRow: 9,
      rawData: left,
    }),
    canonicalRowKey({
      sourceFile: 'Book.xlsx',
      sourceSheet: 'A',
      sourceRow: 9,
      rawData: right,
    }),
  );
  assert.equal(canonicalContentKey(left), canonicalContentKey(right));
});

test('content keys collapse duplicate rows while row keys retain location', () => {
  const rawData = { RIA: 'Acme', 'First Name': 'Alex' };

  assert.equal(
    canonicalContentKey(rawData),
    canonicalContentKey({ ...rawData }),
  );
  assert.notEqual(
    canonicalRowKey({
      sourceFile: 'a.csv',
      sourceSheet: null,
      sourceRow: 1,
      rawData,
    }),
    canonicalRowKey({
      sourceFile: 'a.csv',
      sourceSheet: null,
      sourceRow: 2,
      rawData,
    }),
  );
});

test('normalizers accept canonical contacts and reject unstructured residuals', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(normalizeEmail('not an email'), null);
  assert.deepEqual(normalizePhone('(312) 555-0198 x55'), {
    number: '3125550198',
    countryCode: 'US',
    callingCode: '+1',
  });
  assert.equal(normalizePhone('call the office'), null);
  assert.equal(
    normalizeLinkedIn('linkedin.com/in/example'),
    'https://linkedin.com/in/example',
  );
  assert.equal(normalizeLinkedIn('example'), null);
});
