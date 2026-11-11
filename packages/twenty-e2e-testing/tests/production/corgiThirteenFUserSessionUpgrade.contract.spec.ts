import { expect, test } from '@playwright/test';

import { VERSION } from './corgiThirteenFDeploymentState.mjs';
import { upgradeCorgiThirteenFWithUserSession } from './corgiThirteenFUserSessionUpgrade.mjs';

const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const USER_WORKSPACE_ID = '767771e9-834d-4a89-88ca-1df32d101a40';
const REGISTRATION_ID = '19aacdf4-47c0-4afb-99f0-0a1c4885082b';

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

const snapshot = ({ version = '0.2.1', ...membershipOverrides } = {}) => ({
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
  registration,
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
