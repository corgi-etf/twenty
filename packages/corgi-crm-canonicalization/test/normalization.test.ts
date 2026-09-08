import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalContentKey,
  canonicalRowKey,
  parseRawData,
  rawAuditKey,
  normalizeEmail,
  normalizeLinkedIn,
  normalizeDomain,
  normalizePhone,
  stableStringify,
  textValue,
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

test('live TEXT raw data is parsed before semantic hashing', () => {
  const left = '{"First Name":" Jos\u00e9 ","RIA":"Acme\\r\\nAdvisors"}';
  const right = '{ "ria": "Acme\\nAdvisors", "first_name": "José" }';

  assert.deepEqual(parseRawData(left), {
    'First Name': ' José ',
    RIA: 'Acme\r\nAdvisors',
  });
  assert.equal(canonicalContentKey(left), canonicalContentKey(right));
  assert.notEqual(rawAuditKey(left), rawAuditKey(right));
  assert.throws(() => parseRawData('[]'), /JSON object/);
  assert.throws(() => parseRawData('not-json'), /valid JSON/);
});

test('row keys canonicalize source location without collapsing different rows', () => {
  const rawData = '{"RIA":"Acme"}';

  assert.equal(
    canonicalRowKey({
      sourceFile: ' leads.csv ',
      sourceSheet: ' Sheet 1 ',
      sourceRow: '009',
      rawData,
    }),
    canonicalRowKey({
      sourceFile: 'leads.csv',
      sourceSheet: 'Sheet 1',
      sourceRow: 9,
      rawData,
    }),
  );
  assert.notEqual(
    canonicalRowKey({
      sourceFile: 'leads.csv',
      sourceSheet: 'Sheet 1',
      sourceRow: 9,
      rawData,
    }),
    canonicalRowKey({
      sourceFile: 'leads.csv',
      sourceSheet: 'Sheet 1',
      sourceRow: 10,
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
    extension: '55',
  });
  assert.equal(normalizePhone('call the office'), null);
  assert.equal(
    normalizeLinkedIn('linkedin.com/in/example'),
    'https://linkedin.com/in/example',
  );
  assert.equal(normalizeLinkedIn('example'), null);
  assert.equal(
    normalizeLinkedIn('https://www.linkedin.com/in/example/?trk=abc#bio'),
    'https://linkedin.com/in/example',
  );
  assert.equal(normalizeDomain('https://user:password@example.com'), null);
  assert.equal(normalizeDomain('localhost'), null);
  assert.equal(normalizeDomain('WWW.Example.COM/path'), 'example.com');
});

test('serialization rejects undefined and structured text stays lossless', () => {
  assert.throws(() => stableStringify(undefined), /undefined/);
  assert.equal(textValue(['a,b', 'c']), '["a,b","c"]');
});
