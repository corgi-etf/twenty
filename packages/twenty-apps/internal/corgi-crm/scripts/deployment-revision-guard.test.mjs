import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertAllowedChangedPaths,
  parseNulDelimitedPaths,
  verifyDeploymentRevision,
} from './deployment-revision-guard.mjs';

const execFileAsync = promisify(execFile);
const guardPath = fileURLToPath(
  new URL('./deployment-revision-guard.mjs', import.meta.url),
);

const DEPLOYED_SHA = '1111111111111111111111111111111111111111';
const WORKFLOW_SHA = '2222222222222222222222222222222222222222';
const ALLOWED_PATHS = [
  '.github/workflows/corgi-crm-app-production.yml',
  '.github/workflows/crm-outreach-activity-import.yml',
  '.github/workflows/crm-territory-identity-discovery.yml',
  '.github/workflows/crm-workspace-config.yml',
  'packages/corgi-crm-activity-import/src/execution.ts',
  'packages/corgi-crm-activity-import/src/importer.ts',
  'packages/corgi-crm-activity-import/test/artifacts.test.ts',
  'packages/corgi-crm-activity-import/test/completed-action-normalizer.test.ts',
  'packages/corgi-crm-activity-import/test/execution.test.ts',
  'packages/corgi-crm-activity-import/test/importer.test.ts',
  'packages/corgi-crm-workspace-config/src/planner.ts',
  'packages/corgi-crm-workspace-config/src/territory-identity-discovery.ts',
  'packages/corgi-crm-workspace-config/test/execution.test.ts',
  'packages/corgi-crm-workspace-config/test/planner.test.ts',
  'packages/corgi-crm-workspace-config/test/territory-identity-discovery.test.ts',
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
  'packages/twenty-apps/internal/corgi-crm/README.md',
  'packages/twenty-e2e-testing/tests/production/activityImport.maintenance.spec.ts',
  'packages/twenty-e2e-testing/tests/production/workspaceConfiguration.maintenance.spec.ts',
  'packages/twenty-e2e-testing/tests/production/workspaceTerritoryIdentityDiscovery.maintenance.spec.ts',
];

const expectedGitCalls = (
  deployedSha = DEPLOYED_SHA,
  workflowSha = WORKFLOW_SHA,
) => [
  [
    'git',
    ['merge-base', '--is-ancestor', deployedSha, workflowSha],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 },
  ],
  [
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      `${deployedSha}..${workflowSha}`,
      '--',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 },
  ],
];

describe('production deployment revision guard', () => {
  it('explicitly distinguishes a separately published app release from server runtime changes', () => {
    const appPaths = [
      'packages/twenty-apps/internal/corgi-crm/src/application-config.ts',
      'packages/twenty-apps/internal/corgi-crm/src/modules/telegram/services/telegram-command.service.ts',
      'packages/twenty-apps/internal/corgi-crm/package.json',
      'packages/twenty-apps/internal/corgi-crm/README.md',
      'packages/twenty-apps/internal/corgi-crm/scripts/configure-telegram.mjs',
      'packages/twenty-apps/internal/corgi-crm/scripts/configure-telegram.test.mjs',
    ];
    assert.throws(() => assertAllowedChangedPaths(appPaths), {
      code: 'NON_MAINTENANCE_CHANGE',
    });
    assert.deepEqual(assertAllowedChangedPaths(appPaths, 'app-release'), {
      changedPathCount: appPaths.length,
    });
    for (const path of [
      'packages/twenty-apps/internal/corgi-crm/yarn.lock',
      'packages/twenty-apps/internal/corgi-crm/tsconfig.json',
      'packages/twenty-apps/internal/other-app/src/index.ts',
      'packages/twenty-server/src/server.ts',
      'packages/twenty-client-sdk/src/index.ts',
      'yarn.lock',
      'infra/aws/production/locals.tf',
    ])
      assert.throws(() => assertAllowedChangedPaths([path], 'app-release'), {
        code: 'SERVER_RUNTIME_CHANGE',
      });
    assert.throws(() => assertAllowedChangedPaths([], 'anything'), {
      code: 'INVALID_SCOPE',
    });
  });

  it('requires a version-only package bump for separately published app code', async () => {
    const packagePath = 'packages/twenty-apps/internal/corgi-crm/package.json';
    const appPath =
      'packages/twenty-apps/internal/corgi-crm/src/application-config.ts';
    const run = (before, after) =>
      verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: WORKFLOW_SHA,
        scope: 'app-release',
        executeFile: async (_file, args) => ({
          stdout: Buffer.from(
            args[0] === 'diff'
              ? `${appPath}\0${packagePath}\0`
              : args[0] === 'show'
                ? JSON.stringify(
                    args[1].startsWith(DEPLOYED_SHA) ? before : after,
                  )
                : '',
          ),
        }),
      });
    const before = {
      name: 'corgi-crm',
      version: '1.2.0',
      scripts: { twenty: 'twenty' },
    };
    assert.deepEqual(await run(before, { ...before, version: '1.2.1' }), {
      changedPathCount: 2,
    });
    for (const after of [
      before,
      { ...before, version: '1.1.9' },
      { ...before, version: '1.2.1', scripts: {} },
    ]) {
      await assert.rejects(run(before, after), { code: 'INVALID_APP_RELEASE' });
    }
  });

  it('accepts only the exact reviewed maintenance paths', () => {
    assert.deepEqual(assertAllowedChangedPaths(ALLOWED_PATHS), {
      changedPathCount: ALLOWED_PATHS.length,
    });

    const rejectedPaths = [
      'packages/twenty-apps/internal/corgi-crm/src/constants.ts',
      'packages/twenty-apps/internal/corgi-crm/manifest.json',
      'packages/twenty-apps/internal/corgi-crm/package.json',
      'packages/twenty-apps/internal/corgi-crm/yarn.lock',
      'packages/twenty-apps/internal/corgi-crm/scripts/configure-telegram.mjs',
      'packages/twenty-apps/internal/corgi-crm/scripts/deployment-api-key.mjs',
      'packages/twenty-apps/internal/corgi-crm/scripts/verify-telegram-live.mjs',
      'packages/twenty-server/src/server.ts',
      'packages/twenty-client-sdk/src/index.ts',
      '.github/workflows/crm-workspace-metadata-bootstrap.yml',
      'packages/twenty-e2e-testing/tests/production/another.spec.ts',
    ];

    for (const rejectedPath of rejectedPaths) {
      assert.throws(
        () => assertAllowedChangedPaths([rejectedPath]),
        (error) => {
          assert.equal(error.code, 'NON_MAINTENANCE_CHANGE');
          assert.doesNotMatch(error.message, new RegExp(rejectedPath));

          return true;
        },
      );
    }
  });

  it('accepts identical revisions and executes shell-free bounded git checks', async () => {
    const calls = [];
    const executeFile = async (...args) => {
      calls.push(args);
      return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    };

    assert.deepEqual(
      await verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: DEPLOYED_SHA,
        executeFile,
      }),
      { changedPathCount: 0 },
    );
    assert.deepEqual(calls, expectedGitCalls(DEPLOYED_SHA, DEPLOYED_SHA));
  });

  it('accepts an ancestor only when every NUL-delimited changed path is reviewed', async () => {
    let callIndex = 0;
    const calls = [];
    const executeFile = async (...args) => {
      calls.push(args);
      const stdout =
        callIndex++ === 0
          ? Buffer.alloc(0)
          : Buffer.from(`${ALLOWED_PATHS.join('\0')}\0`);
      return { stdout, stderr: Buffer.alloc(0) };
    };

    assert.deepEqual(
      await verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: WORKFLOW_SHA,
        executeFile,
      }),
      { changedPathCount: ALLOWED_PATHS.length },
    );
    assert.deepEqual(calls, expectedGitCalls());
  });

  it('executes against a real repository and rejects later runtime drift', async (testContext) => {
    const directory = await mkdtemp(
      join(tmpdir(), 'corgi-crm-deployment-revision-'),
    );
    testContext.after(() => rm(directory, { recursive: true }));
    const runGit = (...args) => execFileAsync('git', args, { cwd: directory });

    await runGit('init', '-b', 'main');
    await runGit('config', 'user.name', 'Corgi CRM verification');
    await runGit('config', 'user.email', 'verification@example.invalid');
    await writeFile(join(directory, 'baseline.txt'), 'deployed\n');
    await runGit('add', 'baseline.txt');
    await runGit('-c', 'commit.gpgSign=false', 'commit', '-m', 'deployed');
    const deployedSha = (await runGit('rev-parse', 'HEAD')).stdout.trim();

    await mkdir(join(directory, '.github/workflows'), { recursive: true });
    await writeFile(
      join(directory, '.github/workflows/corgi-crm-app-production.yml'),
      'name: maintenance recovery\n',
    );
    await runGit('add', '.github/workflows/corgi-crm-app-production.yml');
    await runGit('-c', 'commit.gpgSign=false', 'commit', '-m', 'maintenance');
    const maintenanceSha = (await runGit('rev-parse', 'HEAD')).stdout.trim();

    const accepted = await execFileAsync(
      process.execPath,
      [guardPath, deployedSha, maintenanceSha],
      { cwd: directory },
    );
    assert.deepEqual(JSON.parse(accepted.stdout), {
      deploymentRevisionGuard: {
        status: 'verified',
        changedPathCount: 1,
      },
    });

    const runtimeDirectory = join(
      directory,
      'packages/twenty-apps/internal/corgi-crm/src',
    );
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(join(runtimeDirectory, 'runtime.ts'), 'export {};\n');
    await runGit(
      'add',
      'packages/twenty-apps/internal/corgi-crm/src/runtime.ts',
    );
    await runGit('-c', 'commit.gpgSign=false', 'commit', '-m', 'runtime drift');
    const runtimeSha = (await runGit('rev-parse', 'HEAD')).stdout.trim();

    await assert.rejects(
      execFileAsync(process.execPath, [guardPath, deployedSha, runtimeSha], {
        cwd: directory,
      }),
      (error) => {
        assert.match(error.stderr, /"category":"NON_MAINTENANCE_CHANGE"/);
        assert.doesNotMatch(error.stderr, /runtime\.ts/);
        return true;
      },
    );
  });

  it('uses no-renames so a move cannot hide a forbidden source path', async () => {
    const executeFile = async (_file, args) => {
      if (args[0] === 'merge-base') {
        return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      return {
        stdout: Buffer.from(
          'packages/twenty-apps/internal/corgi-crm/src/old.ts\0' +
            'packages/twenty-apps/internal/corgi-crm/scripts/deployment-revision-guard.test.mjs\0',
        ),
        stderr: Buffer.alloc(0),
      };
    };

    await assert.rejects(
      verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: WORKFLOW_SHA,
        executeFile,
      }),
      { code: 'NON_MAINTENANCE_CHANGE' },
    );
  });

  it('rejects invalid revisions and non-ancestor commits before diffing', async () => {
    let calls = 0;
    await assert.rejects(
      verifyDeploymentRevision({
        deployedSha: 'main; echo unsafe',
        workflowSha: WORKFLOW_SHA,
        executeFile: async () => {
          calls += 1;
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
        },
      }),
      { code: 'INVALID_REVISION' },
    );
    assert.equal(calls, 0);

    await assert.rejects(
      verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: WORKFLOW_SHA,
        executeFile: async () => {
          calls += 1;
          throw new Error('not an ancestor');
        },
      }),
      { code: 'NON_ANCESTOR_REVISION' },
    );
    assert.equal(calls, 1);
  });

  it('rejects malformed path evidence and redacts rejected paths and git failures', async () => {
    assert.throws(() => parseNulDelimitedPaths(Buffer.from('unterminated')), {
      code: 'INVALID_PATH_EVIDENCE',
    });
    assert.throws(
      () =>
        assertAllowedChangedPaths([
          'packages/twenty-apps/internal/corgi-crm/scripts/../src/hidden.ts',
        ]),
      { code: 'INVALID_PATH_EVIDENCE' },
    );

    let calls = 0;
    await assert.rejects(
      verifyDeploymentRevision({
        deployedSha: DEPLOYED_SHA,
        workflowSha: WORKFLOW_SHA,
        executeFile: async () => {
          calls += 1;
          if (calls === 1) {
            return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
          }
          throw new Error('secret repository path');
        },
      }),
      (error) => {
        assert.equal(error.code, 'DIFF_FAILED');
        assert.doesNotMatch(error.message, /secret repository path/);
        return true;
      },
    );
  });
});
