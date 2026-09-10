import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseResponse } from './verify-production-install.mjs';

const response = (body) => ({ ok: true, json: async () => body });

describe('privacy-safe GraphQL verification diagnostics', () => {
  it('identifies schema categories without returning field names or raw messages', async () => {
    await assert.rejects(parseResponse(response({ errors: [
      { message: 'Variable "$privateOwner" of type "UUID!" used in position expecting type "String".',
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
      { message: 'Variable "$privateOwner" of type "UUID!" used in position expecting type "String".',
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
    ] }), 'OwnerPreflight'), (error) => {
      assert.match(error.message, /GRAPHQL_VALIDATION_FAILED\/schema_variable_type_mismatch=2/);
      assert.doesNotMatch(error.message, /privateOwner|UUID|String/);
      return true;
    });
  });

  it('never exposes untrusted error codes, paths, extensions, or partial data', async () => {
    const privateValue = 'Private Owner owner@example.invalid secret-token';
    await assert.rejects(parseResponse(response({
      data: { privateValue },
      errors: [{ message: privateValue, path: [privateValue],
        extensions: { code: privateValue, subCode: privateValue, stackTrace: [privateValue] } }],
    }), 'OwnerPreflight'), (error) => {
      assert.match(error.message, /UNKNOWN\/unexpected=1/);
      assert.doesNotMatch(error.message, /Private|owner@|secret-token|stackTrace/);
      return true;
    });
  });

  it('classifies known server failures with a bounded static vocabulary', async () => {
    for (const [message, category] of [
      ['Cannot query field "privateField" on type "PrivateType".', 'schema_unknown_field'],
      ['Field "privateField" is not defined by type "PrivateInput".', 'schema_unknown_field'],
      ['Unknown type "PrivateType".', 'schema_unknown_type'],
      ['Invalid filter for owner@example.invalid', 'invalid_filter'],
      ['Permission denied for owner@example.invalid', 'permission_denied'],
      ['duplicate key value violates unique constraint "PrivateConstraint"', 'constraint_conflict'],
      ['column "privateOwnerId" does not exist', 'database_missing_column'],
      ['relation "privateWholesaler" does not exist', 'database_missing_relation'],
      ['operator does not exist: uuid = text', 'database_operator_type_mismatch'],
      ['invalid input syntax for type uuid: "private-owner"', 'database_value_type_mismatch'],
    ]) {
      await assert.rejects(parseResponse(response({ errors: [{ message,
        extensions: { code: 'BAD_USER_INPUT' } }] }), 'OwnerPreflight'), (error) => {
        assert.ok(error.message.includes(`BAD_USER_INPUT/${category}=1`));
        assert.doesNotMatch(error.message, /privateField|PrivateType|PrivateInput|owner@|PrivateConstraint/);
        return true;
      });
    }
  });

  it('preserves success and rejects HTTP failures and missing data', async () => {
    assert.deepEqual(await parseResponse(response({ data: { count: 1 } }), 'Read'), { count: 1 });
    await assert.rejects(parseResponse({ ok: false, status: 403 }, 'Read'), /HTTP 403/);
    await assert.rejects(parseResponse(response({}), 'Read'), /returned no data/);
    await assert.rejects(parseResponse(response({ errors: [null] }), 'Read'), /UNKNOWN\/unexpected=1/);
  });
});
