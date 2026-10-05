import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  EXPERIENCE_APP_ID,
  EXPERIENCE_ORIGIN,
  EXPERIENCE_VERSION,
  rolloutDigest,
  validateRolloutOptions,
  validateReviewedRollout,
  runExperienceRollout,
} from '../../../../twenty-e2e-testing/tests/production/crmExperienceRollout.mjs';
const options = {
  origin: EXPERIENCE_ORIGIN,
  operation: 'preview',
  dataset: 'configuration',
  deployedSha: 'a'.repeat(40),
  workflowSha: 'a'.repeat(40),
  runId: '123',
  runAttempt: '1',
};
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-rollout-test-'));
  const writes = [];
  const approvals = [];
  const journal = [];
  let stored;
  let failExecution = false;
  let failApproval = false;
  let tokenBaseline = 'true';
  const manifest = {
    workspaceId: 'workspace',
    phase: 'metadata',
    operations: [
      { method: 'createMetadataField', args: [{ name: 'activeClient' }] },
    ],
  };
  const digest = rolloutDigest(manifest);
  const backfill = { ...manifest, digest, version: 1 };
  const request = {
    post: async () => ({
      ok: () => true,
      status: () => 200,
      dispose: async () => {},
      json: async () => ({
        data: {
          currentWorkspace: { id: 'workspace' },
          currentUser: {
            currentUserWorkspace: {
              permissionFlags: ['APPLICATIONS', 'WORKFLOWS', 'DATA_MODEL'],
            },
          },
          findOneApplication: {
            id: 'installed-app',
            universalIdentifier: EXPERIENCE_APP_ID,
            version: EXPERIENCE_VERSION,
            applicationVariables: [
              { key: 'CORGI_CRM_TELEGRAM_ENABLED', value: tokenBaseline },
            ],
          },
        },
      }),
    }),
  };
  const modules = {
    api: {
      createWorkspaceConfigRequestGate: () => (action) => action(),
      assertWorkspaceConfigTenant: async () => ({ workspaceId: 'workspace' }),
      createTwentyWorkspaceConfigApi: () => ({
        listWorkspaceConfigSnapshot: async () => ({}),
      }),
    },
    config: {
      buildExperienceConfigManifest: () => manifest,
      applyExperienceConfigManifest: async (input) => {
        writes.push(input);
        return {
          applied: 1,
          remainingOperations: 0,
          nextPhase: 'layout',
          requiresNewReviewedPreview: false,
        };
      },
    },
    owners: { ownershipManifestDigest: rolloutDigest },
    files: {
      protectedArtifactPath: async (path) => path,
      writeNewArtifact: async (_path, value) => {
        stored = value;
      },
      readArtifact: async () => stored,
      openDurableJournal: async () => ({
        entries: [],
        append: async (entry) => journal.push(entry),
        close: async () => {},
      }),
    },
    backfill: {
      buildExperienceBackfill: () => backfill,
      validateBackfillManifest: () => {},
      createExperienceBackfillRepository: () => ({
        list: async () => [],
        resolveBackfillFunction: async () => ({
          applicationId: 'installed-app',
          functionId: 'installed-function',
          activeDigest: '',
        }),
        approve: async (_app, value) => {
          approvals.push(value);
          if (value && failApproval) throw new Error('approval response lost');
        },
        execute: async () => {
          writes.push('execute');
          if (failExecution) throw new Error('simulated failure');
          return { status: 'updated' };
        },
      }),
    },
  };
  const run = (overrides = {}) =>
    runExperienceRollout({
      request,
      modules,
      options: { ...options, outputDirectory: directory, ...overrides },
    });
  return {
    run,
    writes,
    approvals,
    journal,
    getStored: () => stored,
    setStored: (value) => {
      stored = value;
    },
    setFailure: () => {
      failExecution = true;
    },
    setApprovalFailure: () => {
      failApproval = true;
    },
    setBaseline: () => {
      tokenBaseline = 'false';
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
};
const applyOptions = (digest, dataset = 'configuration') => ({
  operation: 'apply',
  dataset,
  reviewedDigest: digest,
  previewRunId: options.runId,
  previewRunAttempt: options.runAttempt,
  confirmation: 'APPLY_REVIEWED_CRM_EXPERIENCE',
  runId: '456',
});
test('preview creates a reviewable digest artifact with no CRM mutations', async () => {
  const fixtureValue = await fixture();
  try {
    const result = await fixtureValue.run();
    assert.equal(fixtureValue.writes.length, 0);
    assert.match(result.digest, /^[a-f0-9]{64}$/);
    assert.equal(
      fixtureValue.getStored().manifest.operations[0].method,
      'createMetadataField',
    );
    assert.equal(result.operations, 1);
  } finally {
    await fixtureValue.cleanup();
  }
});
test('apply uses the exact reviewed source manifest and rejects an edited artifact before mutation', async () => {
  const fixtureValue = await fixture();
  try {
    const preview = await fixtureValue.run();
    const original = fixtureValue.getStored();
    fixtureValue.setStored({
      ...original,
      manifest: { ...original.manifest, operations: [] },
    });
    await assert.rejects(
      fixtureValue.run(applyOptions(preview.digest)),
      /digest/,
    );
    assert.equal(fixtureValue.writes.length, 0);
    fixtureValue.setStored(original);
    const applied = await fixtureValue.run(applyOptions(preview.digest));
    assert.equal(applied.result.verified, true);
    assert.equal(fixtureValue.writes[0].manifest, original.manifest);
    assert.equal(
      fixtureValue.writes[0].reviewedDigest,
      original.manifestDigest,
    );
  } finally {
    await fixtureValue.cleanup();
  }
});
test('owning-application approval is cleared after a failed apply and intent is journaled first', async () => {
  const fixtureValue = await fixture();
  try {
    const preview = await fixtureValue.run({
      dataset: 'activities-allocations',
    });
    const innerDigest = fixtureValue.getStored().manifestDigest;
    fixtureValue.setFailure();
    await assert.rejects(
      fixtureValue.run(applyOptions(preview.digest, 'activities-allocations')),
      /simulated failure/,
    );
    assert.deepEqual(fixtureValue.approvals, [innerDigest, '']);
    assert.equal(fixtureValue.journal[0].kind, 'intent');
    assert.equal(fixtureValue.journal[0].digest, preview.digest);
  } finally {
    await fixtureValue.cleanup();
  }
});
test('clears digest approval even when the approval mutation response is lost', async () => {
  const fixtureValue = await fixture();
  try {
    const preview = await fixtureValue.run({
      dataset: 'activities-allocations',
    });
    const innerDigest = fixtureValue.getStored().manifestDigest;
    fixtureValue.setApprovalFailure();
    await assert.rejects(
      fixtureValue.run(applyOptions(preview.digest, 'activities-allocations')),
      /approval response lost/,
    );
    assert.deepEqual(fixtureValue.approvals, [innerDigest, '']);
    assert.equal(fixtureValue.writes.length, 0);
  } finally {
    await fixtureValue.cleanup();
  }
});
test('a Telegram baseline change after preview prevents all planned writes', async () => {
  const fixtureValue = await fixture();
  try {
    const preview = await fixtureValue.run();
    fixtureValue.setBaseline();
    await assert.rejects(
      fixtureValue.run(applyOptions(preview.digest)),
      /baseline/,
    );
    assert.equal(fixtureValue.writes.length, 0);
  } finally {
    await fixtureValue.cleanup();
  }
});
test('rejects cross-revision, wrong dataset, missing approval and invalid inventory count', () => {
  assert.throws(
    () => validateRolloutOptions({ ...options, workflowSha: 'b'.repeat(40) }),
    /revision/,
  );
  assert.throws(
    () => validateRolloutOptions({ ...options, operation: 'apply' }),
    /reviewed/,
  );
  assert.throws(
    () => validateRolloutOptions({ ...options, dataset: 'ownership' }),
    /count/,
  );
  const body = {
    version: 1,
    ...options,
    workspaceId: 'workspace',
    appVersion: EXPERIENCE_VERSION,
    previewRunId: '123',
    previewRunAttempt: '1',
    telegramDigest: 'baseline',
  };
  const bundle = { ...body, digest: rolloutDigest(body) };
  assert.throws(
    () =>
      validateReviewedRollout(
        bundle,
        { ...options, ...applyOptions(bundle.digest), dataset: 'ownership' },
        'workspace',
        'baseline',
      ),
    /identity/,
  );
});
test('workflow is manual, private, exact-revision, review-artifact bound, and serial with deployments', async () => {
  const text = await readFile(
    new URL(
      '../../../../../.github/workflows/crm-experience-rollout.yml',
      import.meta.url,
    ),
    'utf8',
  );
  const workflow = YAML.parse(text);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.concurrency.group, 'crm-production-deploy');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.rollout.environment, 'production');
  assert.equal(workflow.permissions.contents, 'read');
  for (const required of [
    'REPOSITORY_PRIVATE',
    'head_sha == $sha',
    'run_attempt == $attempt',
    '.path == ".github/workflows/crm-experience-rollout.yml"',
    'imageTag=git-${DEPLOYED_SHA}',
    'for container in server worker',
    '.imageDigest == $digest',
    'CRM_E2E_LOGIN',
    'CRM_E2E_PASSWORD',
  ])
    assert.ok(text.includes(required), required);
  const uploads = workflow.jobs.rollout.steps.filter(({ uses }) =>
    uses?.startsWith('actions/upload-artifact@'),
  );
  assert.equal(uploads.length, 2);
  for (const upload of uploads) {
    assert.equal(upload.with['retention-days'], 7);
    assert.ok(!/\.auth|run_results|trace|screenshot/.test(upload.with.path));
  }
  const spec = await readFile(
    new URL(
      '../../../../twenty-e2e-testing/tests/production/crmExperienceRollout.maintenance.spec.ts',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(spec, /CRM_EXPERIENCE_ROLLOUT_ENABLED !== 'true'/);
  assert.match(spec, /retries: 0/);
  assert.match(spec, /screenshot: 'off', trace: 'off', video: 'off'/);
});
