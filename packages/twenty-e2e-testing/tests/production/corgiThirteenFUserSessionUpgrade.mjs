import {
  VERSION,
  WORKSPACE_ID,
  classifyDeploymentState,
} from './corgiThirteenFDeploymentState.mjs';

const WORKSPACE_NAME = 'Corgi ETF';
const REQUIRED_PERMISSION = 'APPLICATIONS';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUserSession = (snapshot, expectedUserWorkspaceId) => {
  const workspace = snapshot?.currentWorkspace;
  const userWorkspace = snapshot?.currentUser?.currentWorkspace;
  const membership = snapshot?.currentUser?.currentUserWorkspace;

  if (
    workspace?.id !== WORKSPACE_ID ||
    workspace?.displayName !== WORKSPACE_NAME ||
    userWorkspace?.id !== WORKSPACE_ID ||
    userWorkspace?.displayName !== WORKSPACE_NAME ||
    !uuidPattern.test(expectedUserWorkspaceId) ||
    membership?.id !== expectedUserWorkspaceId ||
    membership?.isImpersonating !== false ||
    !Array.isArray(membership?.permissionFlags) ||
    !membership.permissionFlags.includes(REQUIRED_PERMISSION)
  ) {
    throw new Error(
      'Corgi 13F upgrade requires the authenticated Corgi ETF deployment session',
    );
  }
};

const deploymentState = (snapshot, expectedUserWorkspaceId) => {
  assertUserSession(snapshot, expectedUserWorkspaceId);
  return classifyDeploymentState({
    applications: snapshot.applications,
    registration: snapshot.registration,
  });
};

const upgradeCorgiThirteenFWithUserSession = async ({
  expectedUserWorkspaceId,
  readSnapshot,
  requestUpgrade,
  wait,
  maxAttempts = 12,
}) => {
  if (
    typeof readSnapshot !== 'function' ||
    typeof requestUpgrade !== 'function' ||
    typeof wait !== 'function' ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    throw new Error('Corgi 13F user-session upgrade inputs are invalid');
  }

  const beforeSnapshot = await readSnapshot();
  const before = deploymentState(beforeSnapshot, expectedUserWorkspaceId);

  if (before.mode === 'installed') {
    return { status: 'already-installed' };
  }
  if (before.mode !== 'upgrade-required' || before.publish) {
    throw new Error(
      `Corgi 13F cannot be upgraded from deployment state ${before.mode}`,
    );
  }

  const registrationId = beforeSnapshot.registration?.id;
  if (!uuidPattern.test(registrationId)) {
    throw new Error('Corgi 13F registration identity is invalid');
  }

  let mutationError;
  try {
    const accepted = await requestUpgrade({
      appRegistrationId: registrationId,
      targetVersion: VERSION,
    });
    if (accepted !== true) {
      mutationError = new Error('Corgi 13F upgrade was not accepted');
    }
  } catch (error) {
    mutationError = error;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const state = deploymentState(
      await readSnapshot(),
      expectedUserWorkspaceId,
    );

    if (state.mode === 'installed') {
      return { status: 'upgraded' };
    }
    if (state.mode !== 'upgrade-required') {
      throw new Error(
        `Corgi 13F entered unexpected state ${state.mode} during upgrade`,
      );
    }
    if (attempt < maxAttempts) {
      await wait();
    }
  }

  throw mutationError ?? new Error('Corgi 13F upgrade did not converge');
};

export { upgradeCorgiThirteenFWithUserSession };
