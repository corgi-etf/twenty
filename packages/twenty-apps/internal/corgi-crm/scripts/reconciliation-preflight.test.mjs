import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inspectReconciliationPreflight } from './verify-production-install.mjs';

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
const client = ({ members = [member], wholesalers = [wholesaler], filtered } = {}) =>
  async ({ query, variables }) => {
    assert.doesNotMatch(query, /\bmutation\b/);
    if (query.includes('workspaceMembers(')) return { workspaceMembers: connection(members) };
    if (query.includes('filter:')) {
      assert.equal(variables.memberId, member.id);
      assert.equal(variables.emailPattern, 'owner\\_test@example.invalid');
      return filtered ?? { byMember: connection([]), byEmail: connection(wholesalers) };
    }
    return { wholesalers: connection(wholesalers) };
  };

describe('read-only owner reconciliation preflight', () => {
  it('proves the actual filtered reads and emits only aggregate diagnostics', async () => {
    const result = await inspectReconciliationPreflight({ graphql: client() });
    assert.deepEqual(result, {
      members: 1, wholesalers: 1, needsCreation: 0, existingIdentity: 1,
      missingMemberIdentity: 0, ambiguousIdentity: 0, conflictingMemberLink: 0,
      filteredReadMismatch: 0,
    });
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
      filtered: { byMember: connection([]), byEmail: connection([]) },
    }) });
    assert.equal(result.filteredReadMismatch, 1);
  });

  it('rejects malformed filtered connections', async () => {
    await assert.rejects(inspectReconciliationPreflight({
      graphql: client({ filtered: { byMember: null, byEmail: connection([]) } }),
    }), /invalid filtered connection/);
  });
});
