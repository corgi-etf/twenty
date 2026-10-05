import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCompanyOwnershipPreview } from '../src/company-ownership-preview.ts';
const companies = [
  {
    id: 'company-1',
    updatedAt: '2026-10-05T12:00:00.000Z',
    accountOwnerId: 'member-1',
    historicalOwnerId: 'wholesaler-1',
  },
];
const wholesalers = [{ id: 'wholesaler-1', workspaceMemberId: 'member-1' }];
test('deduplicates equivalent legacy owners, preserves source fields, and reruns without additions', () => {
  const plan = buildCompanyOwnershipPreview({
    companies,
    wholesalers,
    existingOwnerships: [],
    expectedCompanyCount: 1,
  });
  assert.equal(plan.additions.length, 1);
  assert.equal(plan.additions[0]!.isPrimary, true);
  assert.equal(
    plan.additions[0]!.expectedCompanyUpdatedAt,
    companies[0]!.updatedAt,
  );
  assert.deepEqual(plan.review, []);
  assert.deepEqual(
    buildCompanyOwnershipPreview({
      companies,
      wholesalers,
      existingOwnerships: plan.additions,
      expectedCompanyCount: 1,
    }).additions,
    [],
  );
  assert.equal(companies[0]!.accountOwnerId, 'member-1');
});
test('keeps both different legacy owners and reports conflicts without guessing identity', () => {
  const plan = buildCompanyOwnershipPreview({
    companies,
    wholesalers: [
      { id: 'wholesaler-1' },
      { id: 'wholesaler-2', workspaceMemberId: 'member-1' },
    ],
    existingOwnerships: [],
    expectedCompanyCount: 1,
  });
  assert.equal(plan.additions.length, 2);
  assert.equal(
    plan.additions.find(({ isPrimary }) => isPrimary)?.wholesalerId,
    'wholesaler-1',
  );
  assert.equal(plan.review[0]?.reason, 'different-legacy-owners');
  const ambiguous = buildCompanyOwnershipPreview({
    companies,
    wholesalers: [
      ...wholesalers,
      { id: 'other', workspaceMemberId: 'member-1' },
    ],
    existingOwnerships: [],
    expectedCompanyCount: 1,
  });
  assert.equal(ambiguous.review[0]?.reason, 'ambiguous-account-owner');
  assert.equal(ambiguous.additions.length, 1);
});
test('refuses an incomplete inventory', () => {
  assert.throws(
    () =>
      buildCompanyOwnershipPreview({
        companies,
        wholesalers,
        existingOwnerships: [],
        expectedCompanyCount: 2,
      }),
    /exact distinct/,
  );
});
