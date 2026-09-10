import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify, TextDecoder } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
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
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

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

export const assertAllowedChangedPaths = (paths) => {
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
    (path) => !EXACT_ALLOWED_PATHS.has(path),
  ).length;

  if (rejectedCount > 0) {
    throw guardError(
      'NON_MAINTENANCE_CHANGE',
      `Deployment revision guard rejected ${rejectedCount} non-maintenance changed path(s)`,
    );
  }

  return { changedPathCount: paths.length };
};

export const verifyDeploymentRevision = async ({
  deployedSha,
  workflowSha,
  executeFile = execFileAsync,
}) => {
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

  return assertAllowedChangedPaths(parseNulDelimitedPaths(output.stdout));
};

const main = async () => {
  try {
    const result = await verifyDeploymentRevision({
      deployedSha: process.argv[2] ?? '',
      workflowSha: process.argv[3] ?? '',
    });
    console.log(
      JSON.stringify({
        deploymentRevisionGuard: { status: 'verified', ...result },
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
