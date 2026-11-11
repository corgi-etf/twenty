import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  PUBLISHED_VERSION,
  VERSION,
} from './corgiThirteenFDeploymentState.mjs';
import { upgradeCorgiThirteenFWithUserSession } from './corgiThirteenFUserSessionUpgrade.mjs';

const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const USER_WORKSPACE_ID = '767771e9-834d-4a89-88ca-1df32d101a40';
const REGISTRATION_ID = '19aacdf4-47c0-4afb-99f0-0a1c4885082b';
const workflow = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '.github/workflows/corgi-thirteen-f-app-production.yml',
  ),
  'utf8',
);

const registration = {
  id: REGISTRATION_ID,
  universalIdentifier: APPLICATION_ID,
  ownerWorkspaceId: WORKSPACE_ID,
  name: 'Corgi 13F',
  sourceType: 'TARBALL',
  latestAvailableVersion: VERSION,
  isListed: false,
};

const application = {
  id: '6bf73145-5bb4-4a44-bb0e-8aeb9dcfdacb',
  universalIdentifier: APPLICATION_ID,
  applicationRegistrationId: REGISTRATION_ID,
  version: '0.2.1',
  state: 'INSTALLED',
};

const snapshot = ({
  version = '0.2.1',
  registrationVersion = VERSION,
  ...membershipOverrides
} = {}) => ({
  currentWorkspace: { id: WORKSPACE_ID, displayName: 'Corgi ETF' },
  currentUser: {
    currentWorkspace: { id: WORKSPACE_ID, displayName: 'Corgi ETF' },
    currentUserWorkspace: {
      id: USER_WORKSPACE_ID,
      permissionFlags: ['APPLICATIONS'],
      isImpersonating: false,
      ...membershipOverrides,
    },
  },
  registration: {
    ...registration,
    latestAvailableVersion: registrationVersion,
  },
  applications: [{ ...application, version }],
});

test('upgrades the exact prior release through the authenticated user session', async () => {
  const snapshots = [snapshot(), snapshot({ version: VERSION })];
  const requested: unknown[] = [];

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () => snapshots.shift(),
      requestUpgrade: async (input: unknown) => {
        requested.push(input);
        return true;
      },
      wait: async () => undefined,
    }),
  ).resolves.toEqual({ status: 'upgraded' });
  expect(requested).toEqual([
    { appRegistrationId: REGISTRATION_ID, targetVersion: VERSION },
  ]);
});

test('refuses the failed v0.3.0 recovery state until v0.3.2 is published', async () => {
  let upgradeRequests = 0;

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () =>
        snapshot({
          version: PUBLISHED_VERSION,
          registrationVersion: PUBLISHED_VERSION,
        }),
      requestUpgrade: async () => {
        upgradeRequests += 1;
        return true;
      },
      wait: async () => undefined,
    }),
  ).rejects.toThrow(/cannot be upgraded/);
  expect(upgradeRequests).toBe(0);
});

test('upgrades the failed v0.3.0 recovery state after v0.3.2 is published', async () => {
  const snapshots = [
    snapshot({ version: PUBLISHED_VERSION }),
    snapshot({ version: VERSION }),
  ];
  const requested: unknown[] = [];

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () => snapshots.shift(),
      requestUpgrade: async (input: unknown) => {
        requested.push(input);
        return true;
      },
      wait: async () => undefined,
    }),
  ).resolves.toEqual({ status: 'upgraded' });
  expect(requested).toEqual([
    { appRegistrationId: REGISTRATION_ID, targetVersion: VERSION },
  ]);
});

test('keeps failed v0.3.0 in recovery when an accepted upgrade does not converge', async () => {
  let reads = 0;
  let waits = 0;

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      maxAttempts: 2,
      readSnapshot: async () => {
        reads += 1;
        return snapshot({ version: PUBLISHED_VERSION });
      },
      requestUpgrade: async () => true,
      wait: async () => {
        waits += 1;
      },
    }),
  ).rejects.toThrow('Corgi 13F upgrade did not converge');
  expect(reads).toBe(3);
  expect(waits).toBe(1);
});

test('is idempotent when the exact target release is already installed', async () => {
  let upgradeRequests = 0;

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () => snapshot({ version: VERSION }),
      requestUpgrade: async () => {
        upgradeRequests += 1;
        return true;
      },
      wait: async () => undefined,
    }),
  ).resolves.toEqual({ status: 'already-installed' });
  expect(upgradeRequests).toBe(0);
});

test('fails closed before mutation outside the proven user session', async () => {
  const invalidSnapshots = [
    snapshot({ id: '11111111-1111-4111-8111-111111111111' }),
    snapshot({ isImpersonating: true }),
    snapshot({ isImpersonating: undefined }),
    snapshot({ permissionFlags: [] }),
  ];

  for (const invalidSnapshot of invalidSnapshots) {
    let upgradeRequests = 0;
    await expect(
      upgradeCorgiThirteenFWithUserSession({
        expectedUserWorkspaceId: USER_WORKSPACE_ID,
        readSnapshot: async () => invalidSnapshot,
        requestUpgrade: async () => {
          upgradeRequests += 1;
          return true;
        },
        wait: async () => undefined,
      }),
    ).rejects.toThrow(/authenticated Corgi ETF deployment session/);
    expect(upgradeRequests).toBe(0);
  }
});

test('polls a bounded number of times and reports a rejected mutation only after non-convergence', async () => {
  let reads = 0;
  let waits = 0;
  const mutationError = new Error('upgrade request was rejected');

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      maxAttempts: 2,
      readSnapshot: async () => {
        reads += 1;
        return snapshot();
      },
      requestUpgrade: async () => {
        throw mutationError;
      },
      wait: async () => {
        waits += 1;
      },
    }),
  ).rejects.toBe(mutationError);
  expect(reads).toBe(3);
  expect(waits).toBe(1);
});

test('treats a mutation error as authoritative when polling reports the target release', async () => {
  const mutationError = new Error('manifest migration failed');
  const snapshots = [
    snapshot({ version: PUBLISHED_VERSION }),
    snapshot({ version: VERSION }),
  ];

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () => snapshots.shift(),
      requestUpgrade: async () => {
        throw mutationError;
      },
      wait: async () => undefined,
    }),
  ).rejects.toBe(mutationError);
  expect(snapshots).toHaveLength(0);
});

test('treats an unaccepted mutation as authoritative when polling reports the target release', async () => {
  const snapshots = [snapshot(), snapshot({ version: VERSION })];

  await expect(
    upgradeCorgiThirteenFWithUserSession({
      expectedUserWorkspaceId: USER_WORKSPACE_ID,
      readSnapshot: async () => snapshots.shift(),
      requestUpgrade: async () => false,
      wait: async () => undefined,
    }),
  ).rejects.toThrow('Corgi 13F upgrade was not accepted');
  expect(snapshots).toHaveLength(0);
});

test('inherits and validates the proven membership without an empty env-context override', () => {
  const upgrade = workflow.indexOf(
    '- name: Upgrade the existing Corgi 13F installation in place',
  );
  const configure = workflow.indexOf(
    '- name: Configure the Corgi 13F application variables',
  );
  const upgradeStep = workflow.slice(upgrade, configure);

  expect(upgrade).toBeGreaterThan(-1);
  expect(configure).toBeGreaterThan(upgrade);
  expect(upgradeStep).not.toContain(
    'CORGI_CRM_EXPECTED_USER_WORKSPACE_ID: ${{ env.CORGI_CRM_EXPECTED_USER_WORKSPACE_ID }}',
  );
  expect(upgradeStep).toContain(
    '[[ "${CORGI_CRM_EXPECTED_USER_WORKSPACE_ID:-}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]',
  );
  expect(upgradeStep).not.toContain('continue-on-error');
});
