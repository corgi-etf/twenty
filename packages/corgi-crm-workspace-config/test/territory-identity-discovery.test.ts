import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { WholesalerTerritoryRecord } from '../src/planner.ts';
import {
  buildTerritoryIdentityArtifact,
  preflightTerritoryIdentityArtifact,
  runTerritoryIdentityDiscovery,
  writeTerritoryIdentityArtifact,
} from '../src/territory-identity-discovery.ts';

const identities = {
  Grace: '11111111-1111-4111-8111-111111111111',
  Kelly: '22222222-2222-4222-8222-222222222222',
  Nash: '33333333-3333-4333-8333-333333333333',
} as const;

const wholesaler = (
  id: string,
  name: unknown,
  workspaceMemberId: string | null,
): WholesalerTerritoryRecord => ({
  id,
  updatedAt: '2026-09-09T00:00:00.000Z',
  name,
  workspaceMember: workspaceMemberId ? { id: workspaceMemberId } : null,
});

const approvedWholesalers = (): WholesalerTerritoryRecord[] => [
  wholesaler(
    'wholesaler-grace',
    { firstName: ' Grace ', lastName: 'Hopper' },
    identities.Grace,
  ),
  wholesaler('wholesaler-kelly', 'KELLY Example', identities.Kelly),
  wholesaler(
    'wholesaler-nash',
    { firstName: 'Nash', lastName: 'Example' },
    identities.Nash,
  ),
  wholesaler(
    'wholesaler-unrelated',
    { firstName: 'Other', lastName: 'Person' },
    '44444444-4444-4444-8444-444444444444',
  ),
  wholesaler(
    'wholesaler-not-a-first-name-match',
    'Amazing Grace',
    '77777777-7777-4777-8777-777777777777',
  ),
  wholesaler(
    'wholesaler-unlinked-grace',
    { firstName: 'Grace', lastName: 'Unlinked' },
    null,
  ),
];

test('discovers the three exact linked workspace member identities without PII', () => {
  const artifact = buildTerritoryIdentityArtifact(approvedWholesalers());

  assert.deepEqual(artifact, {
    workspaceMemberIds: identities,
    aggregateIdentityHash:
      '9925a7559a425200cfc8d7572c10ddf7801aba8820710d7549107a6763f1ae02',
  });
  const serializedArtifact = JSON.stringify(artifact);
  for (const forbiddenValue of [
    'Hopper',
    'Example',
    'Unlinked',
    'wholesaler-',
    '@',
  ]) {
    assert.doesNotMatch(serializedArtifact, new RegExp(forbiddenValue));
  }
});

test('discovery runner has a read-only data contract', async () => {
  const calls: string[] = [];
  const artifact = await runTerritoryIdentityDiscovery({
    async listWholesalers() {
      calls.push('listWholesalers');

      return approvedWholesalers();
    },
  });

  assert.deepEqual(calls, ['listWholesalers']);
  assert.deepEqual(artifact.workspaceMemberIds, identities);
});

test('discovery fails closed on missing or ambiguous requested identities', () => {
  const missing = approvedWholesalers().filter(
    ({ workspaceMember }) => workspaceMember?.id !== identities.Nash,
  );
  assert.throws(
    () => buildTerritoryIdentityArtifact(missing),
    /Nash.*exactly one current linked Wholesaler/,
  );

  const ambiguous = [
    ...approvedWholesalers(),
    wholesaler(
      'second-grace',
      { firstName: 'Grace', lastName: 'Duplicate' },
      '55555555-5555-4555-8555-555555555555',
    ),
  ];
  assert.throws(
    () => buildTerritoryIdentityArtifact(ambiguous),
    /Grace.*exactly one current linked Wholesaler/,
  );
});

test('discovery rejects malformed and reused immutable links', () => {
  const invalidLink = approvedWholesalers();
  invalidLink[0] = wholesaler(
    'wholesaler-grace',
    { firstName: 'Grace', lastName: 'Hopper' },
    'not-a-uuid',
  );
  assert.throws(
    () => buildTerritoryIdentityArtifact(invalidLink),
    /linked workspace member identity is invalid/,
  );

  const reusedLink = approvedWholesalers();
  reusedLink[1] = wholesaler(
    'wholesaler-kelly',
    { firstName: 'Kelly', lastName: 'Example' },
    identities.Grace,
  );
  assert.throws(
    () => buildTerritoryIdentityArtifact(reusedLink),
    /linked workspace member identity is reused/,
  );
});

test('discovery rejects malformed names on linked wholesaler profiles', () => {
  const malformed = approvedWholesalers();
  malformed.push(
    wholesaler(
      'malformed-linked-profile',
      { firstName: null, lastName: 'Unknown' },
      '66666666-6666-4666-8666-666666666666',
    ),
  );

  assert.throws(
    () => buildTerritoryIdentityArtifact(malformed),
    /linked Wholesaler name is invalid/,
  );
});

test('writes only the approved PII-safe artifact beneath RUNNER_TEMP', async () => {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'crm-territory-identities-'));
  try {
    const artifact = buildTerritoryIdentityArtifact(approvedWholesalers());
    const requestedPath = join(
      runnerTemp,
      'territory-identity-discovery',
      'workspace-member-identities.json',
    );
    const artifactPath = await preflightTerritoryIdentityArtifact({
      runnerTemp,
      artifactPath: requestedPath,
    });
    await writeTerritoryIdentityArtifact(artifactPath, artifact);

    const serializedArtifact = await readFile(artifactPath, 'utf8');
    assert.deepEqual(JSON.parse(serializedArtifact), artifact);
    assert.equal(
      Object.keys(JSON.parse(serializedArtifact) as object)
        .sort()
        .join(','),
      'aggregateIdentityHash,workspaceMemberIds',
    );
    assert.doesNotMatch(serializedArtifact, /Hopper|Example|@|wholesaler-/);

    await assert.rejects(
      preflightTerritoryIdentityArtifact({
        runnerTemp,
        artifactPath: join(runnerTemp, '..', 'escaped.json'),
      }),
      /must be below RUNNER_TEMP/,
    );
    const symlinkPath = join(runnerTemp, 'artifact-link.json');
    await symlink(artifactPath, symlinkPath);
    await assert.rejects(
      preflightTerritoryIdentityArtifact({
        runnerTemp,
        artifactPath: symlinkPath,
      }),
      /has an invalid type/,
    );
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
