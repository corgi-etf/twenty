import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, promisify, TextDecoder } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const APP_PATH = 'packages/twenty-apps/internal/corgi-crm/';
const APP_RELEASE_PATHS = new Set([
  `${APP_PATH}package.json`,
  `${APP_PATH}README.md`,
  `${APP_PATH}scripts/configure-telegram.mjs`,
  `${APP_PATH}scripts/configure-telegram.test.mjs`,
]);
const EXACT_ALLOWED_PATHS = new Set([
  '.github/workflows/corgi-crm-app-production.yml',
  '.github/workflows/crm-outreach-activity-import.yml',
  '.github/workflows/crm-territory-identity-discovery.yml',
  'packages/corgi-crm-activity-import/test/workflow-contract.test.ts',
  'packages/corgi-crm-workspace-config/test/workflow-contract.test.ts',
  'packages/twenty-apps/internal/corgi-crm/scripts/deployment-revision-guard.mjs',
  'packages/twenty-apps/internal/corgi-crm/scripts/deployment-revision-guard.test.mjs',
  'packages/twenty-apps/internal/corgi-crm/scripts/production-workflow-contract.test.mjs',
  'packages/twenty-apps/internal/corgi-crm/scripts/report-runtime-canary-contract.test.mjs',
  'packages/twenty-apps/internal/corgi-crm/scripts/verify-production-install.mjs',
  'packages/twenty-apps/internal/corgi-crm/scripts/verify-production-install.test.mjs',
  'packages/twenty-e2e-testing/tests/production/meetingBooking.maintenance.spec.ts',
  'packages/twenty-e2e-testing/tests/production/meetingBookingCanaryPreflight.contract.spec.ts',
  'packages/twenty-e2e-testing/tests/production/meetingBookingCanaryPreflight.ts',
]);

class DeploymentRevisionGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeploymentRevisionGuardError';
    this.code = code;
  }
}

const guardError = (code, message) =>
  new DeploymentRevisionGuardError(code, message);

const isCanonicalRepositoryPath = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('/') &&
  !value.includes('\0') &&
  value
    .split('/')
    .every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    );

export const parseNulDelimitedPaths = (value) => {
  if (!Buffer.isBuffer(value) || (value.length > 0 && value.at(-1) !== 0)) {
    throw guardError(
      'INVALID_PATH_EVIDENCE',
      'Deployment revision guard received invalid path evidence',
    );
  }
  if (value.length === 0) return [];

  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw guardError(
      'INVALID_PATH_EVIDENCE',
      'Deployment revision guard received invalid path evidence',
    );
  }

  const paths = decoded.slice(0, -1).split('\0');

  if (paths.some((path) => !isCanonicalRepositoryPath(path))) {
    throw guardError(
      'INVALID_PATH_EVIDENCE',
      'Deployment revision guard received invalid path evidence',
    );
  }

  return paths;
};

export const assertAllowedChangedPaths = (paths, scope = 'maintenance') => {
  if (scope !== 'maintenance' && scope !== 'app-release') {
    throw guardError(
      'INVALID_SCOPE',
      'Deployment revision guard received an invalid scope',
    );
  }
  if (
    !Array.isArray(paths) ||
    paths.some((path) => !isCanonicalRepositoryPath(path))
  ) {
    throw guardError(
      'INVALID_PATH_EVIDENCE',
      'Deployment revision guard received invalid path evidence',
    );
  }

  const rejectedCount = paths.filter(
    (path) =>
      !EXACT_ALLOWED_PATHS.has(path) &&
      !(
        scope === 'app-release' &&
        (path.startsWith(`${APP_PATH}src/`) || APP_RELEASE_PATHS.has(path))
      ),
  ).length;

  if (rejectedCount > 0) {
    throw guardError(
      scope === 'maintenance'
        ? 'NON_MAINTENANCE_CHANGE'
        : 'SERVER_RUNTIME_CHANGE',
      `Deployment revision guard rejected ${rejectedCount} changed path(s) outside its approved scope`,
    );
  }

  return { changedPathCount: paths.length };
};

export const verifyDeploymentRevision = async ({
  deployedSha,
  workflowSha,
  scope = 'maintenance',
  executeFile = execFileAsync,
}) => {
  assertAllowedChangedPaths([], scope);
  if (!SHA_PATTERN.test(deployedSha) || !SHA_PATTERN.test(workflowSha)) {
    throw guardError(
      'INVALID_REVISION',
      'Deployment revision guard received an invalid revision',
    );
  }

  const options = {
    encoding: 'buffer',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  };

  try {
    await executeFile(
      'git',
      ['merge-base', '--is-ancestor', deployedSha, workflowSha],
      options,
    );
  } catch {
    throw guardError(
      'NON_ANCESTOR_REVISION',
      'Deployed revision is not an ancestor of the workflow revision',
    );
  }

  let output;
  try {
    output = await executeFile(
      'git',
      [
        'diff',
        '--name-only',
        '--no-renames',
        '-z',
        `${deployedSha}..${workflowSha}`,
        '--',
      ],
      options,
    );
  } catch {
    throw guardError(
      'DIFF_FAILED',
      'Deployment revision guard could not inspect changed paths',
    );
  }

  const paths = parseNulDelimitedPaths(output.stdout);
  const result = assertAllowedChangedPaths(paths, scope);
  if (
    scope === 'app-release' &&
    paths.some(
      (path) =>
        path.startsWith(`${APP_PATH}src/`) ||
        path === `${APP_PATH}package.json`,
    )
  ) {
    // This proves only server-runtime equivalence. App executable changes must
    // be published separately as an immutable, strictly newer app version.
    // Dependencies, build scripts and SDK changes still require a server release.
    try {
      const readPackage = async (sha) => {
        const value = await executeFile(
          'git',
          ['show', `${sha}:${APP_PATH}package.json`],
          options,
        );
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(value.stdout),
        );
      };
      const [before, after] = await Promise.all([
        readPackage(deployedSha),
        readPackage(workflowSha),
      ]);
      const { version: beforeVersion, ...beforeConfiguration } = before;
      const { version: afterVersion, ...afterConfiguration } = after;
      const versionParts = (value) => {
        if (
          typeof value !== 'string' ||
          !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)
        )
          throw new Error();
        const parts = value.split('.').map(Number);
        if (!parts.every(Number.isSafeInteger)) throw new Error();
        return parts;
      };
      const oldParts = versionParts(beforeVersion);
      const newParts = versionParts(afterVersion);
      const difference = newParts.findIndex(
        (part, index) => part !== oldParts[index],
      );
      if (
        !isDeepStrictEqual(beforeConfiguration, afterConfiguration) ||
        difference < 0 ||
        newParts[difference] <= oldParts[difference]
      )
        throw new Error();
    } catch {
      throw guardError(
        'INVALID_APP_RELEASE',
        'App-only release requires a version-only package bump and unchanged server dependencies',
      );
    }
  }
  return result;
};

const main = async () => {
  try {
    const result = await verifyDeploymentRevision({
      deployedSha: process.argv[2] ?? '',
      workflowSha: process.argv[3] ?? '',
      scope: process.argv[4] ?? 'maintenance',
    });
    console.log(
      JSON.stringify({
        deploymentRevisionGuard: {
          status: 'verified',
          ...(process.argv[4] === 'app-release'
            ? {
                scope: 'server-runtime-only',
                appRelease: 'separate-immutable-publication-required',
              }
            : {}),
          ...result,
        },
      }),
    );
  } catch (error) {
    const category =
      error instanceof DeploymentRevisionGuardError
        ? error.code
        : 'UNEXPECTED_FAILURE';
    console.error(
      JSON.stringify({
        deploymentRevisionGuard: { status: 'rejected', category },
      }),
    );
    process.exitCode = 1;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
