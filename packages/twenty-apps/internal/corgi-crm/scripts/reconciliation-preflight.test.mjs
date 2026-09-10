import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  inspectReconciliationPreflight,
  VerificationGraphqlError,
} from './verify-production-install.mjs';

const member = {
  id: '11111111-1111-4111-8111-111111111111',
  userEmail: 'Owner_Test@example.invalid',
  name: { firstName: 'Private', lastName: 'Owner' },
};
const wholesaler = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner_test@example.invalid',
  name: 'Private Owner',
  wholesalerRole: 'Wholesaler',
  workspaceMemberId: null,
};
const connection = (nodes) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});
const client = ({
  members = [member],
  wholesalers = [wholesaler],
  filteredByMember = connection([]),
  filteredByEmail = connection(wholesalers),
  calls = [],
} = {}) =>
  async ({ operationName, query, variables }) => {
    calls.push(operationName);
    assert.doesNotMatch(query, /\bmutation\b/);
    if (query.includes('workspaceMembers(')) return { workspaceMembers: connection(members) };
    if (operationName === 'PreflightOwnerByMember') {
      assert.equal(variables.memberId, member.id);
      return {
        wholesalers: await (typeof filteredByMember === 'function'
          ? filteredByMember()
          : filteredByMember),
      };
    }
    if (operationName === 'PreflightOwnerByEmail') {
      assert.equal(variables.emailPattern, 'owner\\_test@example.invalid');
      return {
        wholesalers: await (typeof filteredByEmail === 'function'
          ? filteredByEmail()
          : filteredByEmail),
      };
    }
    return { wholesalers: connection(wholesalers) };
  };

describe('read-only owner reconciliation preflight', () => {
  it('proves the actual filtered reads and emits only aggregate diagnostics', async () => {
    const calls = [];
    const result = await inspectReconciliationPreflight({ graphql: client({ calls }) });
    assert.deepEqual(result, {
      members: 1, wholesalers: 1, needsCreation: 0, existingIdentity: 1,
      missingMemberIdentity: 0, ambiguousIdentity: 0, conflictingMemberLink: 0,
      filteredReadMismatch: 0,
    });
    assert.deepEqual(calls, [
      'PreflightOwnerMembers',
      'PreflightOwnerWholesalers',
      'PreflightOwnerByMember',
      'PreflightOwnerByEmail',
    ]);
    assert.doesNotMatch(JSON.stringify(result), /Private|example|11111111|22222222/);
  });

  it('classifies invalid and duplicate identities without mutating or exposing data', async () => {
    const result = await inspectReconciliationPreflight({ graphql: client({
      members: [member, { id: 'member-without-email', userEmail: '' }],
      wholesalers: [wholesaler, { ...wholesaler, id: 'duplicate' }],
    }) });
    assert.equal(result.missingMemberIdentity, 1);
    assert.equal(result.ambiguousIdentity, 1);
  });

  it('detects filtered query drift instead of reporting an empty successful match', async () => {
    const result = await inspectReconciliationPreflight({ graphql: client({
      filteredByEmail: connection([]),
    }) });
    assert.equal(result.filteredReadMismatch, 1);
  });

  it('rejects malformed filtered connections', async () => {
    await assert.rejects(inspectReconciliationPreflight({
      graphql: client({ filteredByMember: null }),
    }), /invalid filtered connection/);
  });

  it('runs both filters and reports only trusted diagnostics when either rejects', async () => {
    const calls = [];
    const privateMessage = 'Variable private@example.invalid of type UUID used in position expecting type String';
    const graphql = client({
      calls,
      filteredByMember: () => Promise.reject(new VerificationGraphqlError(
        'PreflightOwnerByMember',
        [{
          message: privateMessage,
          path: ['private-record-id'],
          extensions: {
            code: 'GRAPHQL_VALIDATION_FAILED',
            private: 'do-not-print',
          },
        }],
      )),
      filteredByEmail: () => Promise.reject(new Error('Private Owner secret@example.invalid')),
    });

    await assert.rejects(
      inspectReconciliationPreflight({ graphql }),
      (error) => {
        assert.equal(
          error.message,
          'Owner reconciliation filtered reads failed: ' +
            'PreflightOwnerByMember=GRAPHQL_VALIDATION_FAILED/schema_variable_type_mismatch=1, ' +
            'PreflightOwnerByEmail=UNKNOWN/unexpected=1',
        );
        assert.doesNotMatch(error.message, /private|example|record-id|do-not-print/i);
        return true;
      },
    );
    assert.equal(calls.filter((name) => name === 'PreflightOwnerByMember').length, 1);
    assert.equal(calls.filter((name) => name === 'PreflightOwnerByEmail').length, 1);
  });
});
