import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyReconciliation } from './verify-production-install.mjs';

const member = {
  id: 'member-1',
  userEmail: 'Damien@Corgi.com',
  name: { firstName: ' Damien ', lastName: ' Wiese ' },
};
const wholesaler = {
  id: 'wholesaler-1',
  name: 'Damien Wiese',
  email: 'damien@corgi.com',
  wholesalerRole: 'Wholesaler',
  workspaceMemberId: 'member-1',
};

describe('production reconciliation verification', () => {
  it('accepts one exact wholesaler identity per usable member', () => {
    assert.deepEqual(
      verifyReconciliation({ members: [member], wholesalers: [wholesaler] }),
      { members: 1, wholesalers: 1 },
    );
  });

  it('rejects duplicate identities matched by member ID or normalized email', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [member],
          wholesalers: [
            wholesaler,
            {
              ...wholesaler,
              id: 'wholesaler-2',
              workspaceMemberId: null,
            },
          ],
        }),
      /has 2 identities/,
    );
  });

  it('rejects links to absent workspace members', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [],
          wholesalers: [wholesaler],
        }),
      /link to absent workspace members/,
    );
  });

  it('rejects identities without the custom wholesaler role field', () => {
    assert.throws(
      () =>
        verifyReconciliation({
          members: [member],
          wholesalers: [{ ...wholesaler, wholesalerRole: null }],
        }),
      /stale identity/,
    );
  });
});
