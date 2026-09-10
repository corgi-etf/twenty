import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const workflowPath = new URL(
  '../../../../../.github/workflows/corgi-crm-app-production.yml',
  import.meta.url,
);
const bootstrapSpecPath = new URL(
  '../../../../twenty-e2e-testing/tests/production/workspaceMetadataBootstrapPrerequisite.production.spec.ts',
  import.meta.url,
);
const workflow = await readFile(workflowPath, 'utf8');
const bootstrapSpec = await readFile(bootstrapSpecPath, 'utf8');
const verifier = await readFile(
  new URL('./verify-production-install.mjs', import.meta.url),
  'utf8',
);

const position = (needle) => {
  const index = workflow.indexOf(needle);
  assert.notEqual(index, -1, `workflow must contain ${needle}`);
  return index;
};

const STEP_SEPARATOR = '\n      - name: ';

const stepBlocks = workflow
  .split(STEP_SEPARATOR)
  .slice(1)
  .map((block) => `${STEP_SEPARATOR}${block}`);

const stepsRunning = (needle) => {
  const matches = stepBlocks.filter((block) => block.includes(needle));
  assert.notEqual(matches.length, 0, `workflow must run ${needle}`);
  return matches;
};

const stepBlock = (name) => {
  const matches = stepBlocks.filter((block) =>
    block.startsWith(`${STEP_SEPARATOR}${name}\n`),
  );
  assert.equal(matches.length, 1, `workflow must define one step ${name}`);
  return matches[0];
};

const parseRunnerEnvironment = (contents) =>
  Object.fromEntries(
    contents
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

describe('Corgi CRM production app workflow contract', () => {
  it('keeps configuration strict and publishes app-only changes as a separate immutable release', () => {
    assert.doesNotMatch(
      workflow,
      /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
    );
    assert.match(
      workflow,
      /node "\$\{APP_PATH\}\/scripts\/deployment-revision-guard\.mjs" \\\n\s+"\$\{DEPLOYED_SHA\}" "\$\{GITHUB_SHA\}"/,
    );
    assert.match(workflow, /\.head_sha == \$deployed_sha/);
    assert.match(workflow, /imageTag=git-\$\{DEPLOYED_SHA\}/);
    assert.match(
      workflow,
      /"\$\{OPERATION\}" == "configure-telegram"[\s\S]*revision_scope=maintenance[\s\S]*revision_scope=app-release/,
    );
    assert.match(
      workflow,
      /"\$\{DEPLOYED_SHA\}" "\$\{GITHUB_SHA\}" "\$\{revision_scope\}"/,
    );
    assert.match(
      workflow,
      /CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED: \$\{\{ vars\.CORGI_CRM_TELEGRAM_PUBLIC_REPORTS_ENABLED \|\| 'false' \}\}/,
    );
    // The group-topic allowlist must reach EVERY configuration write, or the
    // staged runtime silently keeps refusing the approved group.
    const configurationWrites = [
      ...stepsRunning('configure-telegram.mjs" stage'),
      ...stepsRunning('configure-telegram.mjs" enable'),
    ];
    assert.ok(configurationWrites.length >= 2);
    for (const block of configurationWrites) {
      assert.match(
        block,
        /CORGI_CRM_TELEGRAM_GROUP_TOPICS: \$\{\{ secrets\.CORGI_CRM_TELEGRAM_GROUP_TOPICS \}\}/,
      );
      assert.match(
        block,
        /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES: \$\{\{ secrets\.CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES \}\}/,
      );
    }
    assert.doesNotMatch(workflow, /CORGI_CRM_TELEGRAM_GROUP_TOPICS:\s+['"]?-100/);
  });

  it('derives the workspace ID from integrity-validated bootstrap evidence without a UUID literal', () => {
    assert.doesNotMatch(
      workflow,
      /CORGI_CRM_EXPECTED_WORKSPACE_ID:\s+[0-9a-f-]{36}/i,
    );
    assert.doesNotMatch(workflow, /APPROVED_(USER_)?WORKSPACE_ID/);
    assert.doesNotMatch(verifier, /APPROVED_(USER_)?WORKSPACE_ID/);
    assert.doesNotMatch(
      workflow,
      /CRM_WORKSPACE_ENV_PATH:\s*\$\{\{ github\.env \}\}/,
    );
    const prerequisite = workflow.slice(
      position('Verify metadata bootstrap before app preflight'),
      position('Acquire a short-lived deployment API key'),
    );
    assert.match(
      prerequisite,
      /export CRM_WORKSPACE_ENV_PATH="\$GITHUB_ENV"[\s\S]*workspaceMetadataBootstrapPrerequisite/,
    );
    assert.match(
      prerequisite,
      /Verify authenticated tenant environment handoff/,
    );
    assert.match(prerequisite, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(prerequisite, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
    assert.match(bootstrapSpec, /assertCompletedWorkspaceMetadataBootstrap/);
    assert.match(bootstrapSpec, /validated\.workspaceId/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
  });

  it('resolves build-time role identifiers after acquiring the key and before publish', () => {
    const acquire = position('Acquire a short-lived deployment API key');
    const roleStep = position(
      'Resolve least-privilege role object identifiers',
    );
    const roleEnv = position('verify-production-install.mjs" role-env');
    const publish = position('Publish the private Corgi CRM app');
    assert.ok(acquire < roleEnv && roleEnv < publish);
    assert.doesNotMatch(
      workflow,
      /CORGI_CRM_ROLE_ENV_PATH:\s*\$\{\{ github\.env \}\}/,
    );
    const roleHandoff = workflow.slice(roleStep, publish);
    assert.match(roleHandoff, /export CORGI_CRM_ROLE_ENV_PATH="\$GITHUB_ENV"/);
    assert.match(roleHandoff, /Verify application role environment handoff/);
    assert.match(
      roleHandoff,
      /CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER/,
    );
    assert.match(
      roleHandoff,
      /CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER/,
    );
  });

  it('exports tenant and role identifiers to the current runner environment file', async (testContext) => {
    const directory = await mkdtemp(join(tmpdir(), 'corgi-crm-runner-env-'));
    testContext.after(() => rm(directory, { recursive: true }));
    const staleEnvironmentPath = join(directory, 'previous-step.env');
    const currentEnvironmentPath = join(directory, 'current-step.env');
    await Promise.all([
      writeFile(staleEnvironmentPath, ''),
      writeFile(currentEnvironmentPath, ''),
    ]);

    const runtimeExports = [
      workflow.match(/export CRM_WORKSPACE_ENV_PATH="\$GITHUB_ENV"/)?.[0],
      workflow.match(/export CORGI_CRM_ROLE_ENV_PATH="\$GITHUB_ENV"/)?.[0],
    ];
    assert.ok(runtimeExports.every(Boolean));

    await execFileAsync(
      'bash',
      [
        '-c',
        `${runtimeExports.join('\n')}\n` +
          'printf "%s\\n" "CORGI_CRM_EXPECTED_WORKSPACE_ID=$WORKSPACE_ID" >> "$CRM_WORKSPACE_ENV_PATH"\n' +
          'printf "%s\\n" "CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER=$WHOLESALER_ID" >> "$CORGI_CRM_ROLE_ENV_PATH"',
      ],
      {
        env: {
          ...process.env,
          GITHUB_ENV: currentEnvironmentPath,
          CRM_WORKSPACE_ENV_PATH: staleEnvironmentPath,
          CORGI_CRM_ROLE_ENV_PATH: staleEnvironmentPath,
          WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
          WHOLESALER_ID: '22222222-2222-4222-8222-222222222222',
        },
      },
    );

    assert.equal(await readFile(staleEnvironmentPath, 'utf8'), '');
    const nextStepEnvironment = parseRunnerEnvironment(
      await readFile(currentEnvironmentPath, 'utf8'),
    );
    assert.equal(
      nextStepEnvironment.CORGI_CRM_EXPECTED_WORKSPACE_ID,
      '11111111-1111-4111-8111-111111111111',
    );
    assert.equal(
      nextStepEnvironment.CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER,
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('prevalidates trusted config, verifies the exact provider contract, then enables Telegram', () => {
    const configureDisabled = position('configure-telegram.mjs" disabled');
    const stage = position('configure-telegram.mjs" stage');
    const liveVerify = position('verify-telegram-live.mjs" enabled');
    const enable = position('configure-telegram.mjs" enable');
    const installVerify = position('verify-production-install.mjs" telegram');
    assert.ok(
      configureDisabled < stage && stage < liveVerify && liveVerify < enable,
    );
    assert.ok(enable < installVerify);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_LINK_CODES:\s*\$\{\{ secrets\./);
    assert.match(
      workflow,
      /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:\s*\$\{\{ secrets\./,
    );
    const stageBlock = workflow.slice(
      position('Stage Telegram configuration while disabled'),
      position('Register and verify the live Telegram provider'),
    );
    const providerBlock = workflow.slice(
      position('Register and verify the live Telegram provider'),
      position('Enable verified Telegram configuration'),
    );
    const enableBlock = workflow.slice(
      position('Enable verified Telegram configuration'),
      position('Verify installed application, trigger, and reconciliation'),
    );
    assert.match(stageBlock, /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/);
    assert.doesNotMatch(
      providerBlock,
      /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/,
    );
    assert.match(enableBlock, /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/);
    assert.match(
      workflow,
      /CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM:\s*RUN_SIGNED_CANARY/,
    );
  });

  it('always disables and unregisters on opt-out, with idempotent failure cleanup', () => {
    assert.match(
      workflow,
      /Configure Telegram disabled[\s\S]*if:[^\n]*always\(\)/,
    );
    const disabledBlock = workflow.slice(
      position('Configure Telegram disabled'),
      position('Unregister Telegram provider'),
    );
    assert.match(
      disabledBlock,
      /CORGI_CRM_TELEGRAM_TIME_ZONE:\s*\$\{\{ vars\./,
    );
    assert.doesNotMatch(disabledBlock, /CORGI_CRM_TELEGRAM_BOT_TOKEN/);
    assert.match(
      workflow,
      /Unregister Telegram provider[\s\S]*if:[^\n]*!inputs\.telegram_enable/,
    );
    assert.match(workflow, /verify-telegram-live\.mjs" disabled/);
    assert.match(
      workflow,
      /Fail closed after Telegram setup failure[\s\S]*if:[^\n]*failure\(\)/,
    );
    const cleanup = workflow.slice(
      position('Fail closed after Telegram setup failure'),
      position('Revoke the short-lived deployment API key'),
    );
    assert.doesNotMatch(cleanup, /continue-on-error:\s*true/);
    assert.match(cleanup, /set \+e/);
    assert.match(cleanup, /app_cleanup_status=\$\?/);
    assert.match(cleanup, /provider_cleanup_status=\$\?/);
    assert.match(cleanup, /configure-telegram\.mjs" disabled/);
    assert.match(cleanup, /verify-telegram-live\.mjs" disabled/);
    assert.match(cleanup, /exit 1/);
  });

  it('gates publish and configure recovery on installed-version and native report verification before provider activation', () => {
    const installed = position(
      'Verify the installed release before configuration-only changes',
    );
    const configureDisabled = position('Configure Telegram disabled');
    const stage = position('configure-telegram.mjs" stage');
    const canary = position(
      '\n      - name: Verify native CRM meeting booking while Telegram is disabled',
    );
    const register = position(
      '\n      - name: Register and verify the live Telegram provider',
    );
    assert.ok(
      installed < configureDisabled &&
        configureDisabled < stage &&
        stage < canary &&
        canary < register,
    );
    const installedBlock = workflow.slice(installed, configureDisabled);
    assert.match(
      installedBlock,
      /if: inputs\.operation == 'configure-telegram'/,
    );
    assert.match(
      installedBlock,
      /CORGI_CRM_EXPECTED_VERSION:\s*\$\{\{ steps\.app\.outputs\.version \}\}/,
    );
    assert.match(installedBlock, /verify-production-install\.mjs" installed/);
    const canaryBlock = workflow.slice(canary, register);
    assert.doesNotMatch(canaryBlock, /^\s*if:/m);
    assert.doesNotMatch(
      canaryBlock,
      /inputs\.operation == 'publish-and-install'/,
    );
    assert.doesNotMatch(canaryBlock, /if: inputs\.telegram_enable/);
    assert.match(canaryBlock, /CRM_MEETING_CANARY_ENABLED: 'true'/);
    assert.match(
      canaryBlock,
      /VERIFY_NATIVE_CRM_MEETING_WITH_TELEGRAM_DISABLED/,
    );
    assert.match(canaryBlock, /meetingBooking\.maintenance\.spec\.ts/);
    assert.match(
      canaryBlock,
      /--project=production-chromium --no-deps --retries=0 --reporter=line/,
    );
    assert.doesNotMatch(canaryBlock, /continue-on-error/);
  });

  it('derives an exact prior failed-canary cleanup window from trusted workflow evidence', () => {
    assert.match(workflow, /meeting_recovery_run_id:/);
    assert.match(workflow, /meeting_recovery_run_attempt:/);
    assert.match(workflow, /meeting_recovery_confirmation:/);

    const recovery = workflow.slice(
      position('Resolve prior meeting canary recovery evidence'),
      position('Verify exact-SHA metadata bootstrap lineage'),
    );
    assert.match(recovery, /OPERATION: \$\{\{ inputs\.operation \}\}/);
    assert.match(
      recovery,
      /RECOVERY_RUN_ID: \$\{\{ inputs\.meeting_recovery_run_id \}\}/,
    );
    assert.match(
      recovery,
      /RECOVERY_RUN_ATTEMPT: \$\{\{ inputs\.meeting_recovery_run_attempt \}\}/,
    );
    assert.match(
      recovery,
      /RECOVERY_CONFIRMATION: \$\{\{ inputs\.meeting_recovery_confirmation \}\}/,
    );
    assert.match(recovery, /CLEANUP_RUN_OWNED_MEETING/);
    assert.match(recovery, /OPERATION.*configure-telegram/s);
    assert.match(
      recovery,
      /actions\/runs\/\$\{RECOVERY_RUN_ID\}\/attempts\/\$\{RECOVERY_RUN_ATTEMPT\}/,
    );
    assert.match(
      recovery,
      /actions\/runs\/\$\{RECOVERY_RUN_ID\}\/attempts\/\$\{RECOVERY_RUN_ATTEMPT\}\/jobs\?per_page=100/,
    );
    assert.match(
      recovery,
      /trap 'rm -f "\$\{workflow_json\}" "\$\{run_json\}" "\$\{jobs_json\}"' EXIT/,
    );
    assert.match(recovery, /\.workflow_id == \$workflow_id/);
    assert.match(recovery, /\.head_repository\.full_name == \$repository/);
    assert.match(recovery, /\.head_branch == "main"/);
    assert.match(recovery, /\.event == "workflow_dispatch"/);
    assert.match(recovery, /\.conclusion == "failure"/);
    assert.match(
      recovery,
      /Verify native CRM meeting booking while Telegram is disabled/,
    );
    assert.match(recovery, /deployment-revision-guard\.mjs/);
    assert.match(recovery, /"\$\{prior_head_sha\}" "\$\{GITHUB_SHA\}"/);
    assert.match(recovery, /CRM_MEETING_CANARY_RECOVERY_RUN_ID=/);
    assert.match(recovery, /CRM_MEETING_CANARY_RECOVERY_RUN_ATTEMPT=/);
    assert.match(recovery, /CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER=/);
    assert.match(recovery, /CRM_MEETING_CANARY_RECOVERY_CREATED_BEFORE=/);
    assert.match(recovery, /CRM_MEETING_CANARY_RECOVERY_CONFIRMATION=/);
    assert.match(recovery, />> "\$GITHUB_ENV"/);
    assert.match(recovery, /completed - started > 20 \* 60_000/);
    assert.match(recovery, /started - 30_000/);
    assert.match(recovery, /completed \+ 30_000/);

    const canary = workflow.slice(
      position(
        '\n      - name: Verify native CRM meeting booking while Telegram is disabled',
      ),
      position(
        '\n      - name: Register and verify the live Telegram provider',
      ),
    );
    assert.match(
      canary,
      /CRM_MEETING_CANARY_RECOVERY_RUN_ID: \$\{\{ env\.CRM_MEETING_CANARY_RECOVERY_RUN_ID \}\}/,
    );
    assert.match(
      canary,
      /CRM_MEETING_CANARY_RECOVERY_RUN_ATTEMPT: \$\{\{ env\.CRM_MEETING_CANARY_RECOVERY_RUN_ATTEMPT \}\}/,
    );
    assert.match(
      canary,
      /CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER: \$\{\{ env\.CRM_MEETING_CANARY_RECOVERY_CREATED_AFTER \}\}/,
    );
    assert.match(
      canary,
      /CRM_MEETING_CANARY_RECOVERY_CREATED_BEFORE: \$\{\{ env\.CRM_MEETING_CANARY_RECOVERY_CREATED_BEFORE \}\}/,
    );
    assert.match(
      canary,
      /CRM_MEETING_CANARY_RECOVERY_CONFIRMATION: \$\{\{ env\.CRM_MEETING_CANARY_RECOVERY_CONFIRMATION \}\}/,
    );
  });

  it('never destroys a Telegram registration this run already proved live', () => {
    // Every Telegram-owned step needs a stable identifier, because the failure
    // policy tells a genuinely unverified configuration apart from an
    // unrelated failure by reading these outcomes and nothing else.
    const telegramStepIds = {
      'Configure Telegram disabled': 'telegram_disable',
      'Stage Telegram configuration while disabled': 'telegram_stage',
      'Register and verify the live Telegram provider': 'telegram_register',
      'Enable verified Telegram configuration': 'telegram_enable_configuration',
      'Verify installed Telegram contract': 'telegram_contract',
    };
    for (const [name, id] of Object.entries(telegramStepIds)) {
      assert.match(stepBlock(name), new RegExp(`\\n        id: ${id}\\n`));
    }

    const baseline = stepBlock('Capture the Telegram baseline before any change');
    assert.match(baseline, /\n        id: telegram_baseline\n/);
    assert.match(baseline, /CORGI_CRM_TELEGRAM_ENABLED/);
    assert.match(baseline, /verified=\$\{verified\}" >> "\$\{GITHUB_OUTPUT\}"/);
    // The baseline is a read-only probe. It must never mutate Telegram, and a
    // probe that cannot answer must report an unverified baseline so the
    // policy below falls back to tearing Telegram down.
    assert.doesNotMatch(baseline, /configure-telegram\.mjs/);
    assert.doesNotMatch(baseline, /verify-telegram-live\.mjs/);
    assert.match(baseline, /verified=false/);
    assert.ok(
      position('Capture the Telegram baseline before any change') <
        position('Configure Telegram disabled'),
    );

    const policy = stepBlock('Decide the Telegram failure policy');
    assert.match(policy, /\n        id: telegram_policy\n/);
    assert.match(policy, /if:[^\n]*failure\(\)/);
    assert.match(policy, /if:[^\n]*inputs\.telegram_enable/);
    assert.match(policy, /if:[^\n]*steps\.credential\.outputs\.token != ''/);
    assert.match(policy, /set -euo pipefail/);
    assert.match(
      policy,
      /BASELINE_VERIFIED: \$\{\{ steps\.telegram_baseline\.outputs\.verified \}\}/,
    );
    assert.match(
      policy,
      /PRESERVE_REQUESTED: \$\{\{ inputs\.telegram_preserve_verified_state \}\}/,
    );
    for (const id of Object.values(telegramStepIds)) {
      const variable = `${id.replace(/^telegram_/, '').replace(/_configuration$/, '').toUpperCase()}_OUTCOME`;
      assert.match(
        policy,
        new RegExp(`${variable}: \\$\\{\\{ steps\\.${id}\\.outcome \\}\\}`),
      );
      // Any Telegram-owned step failing means the configuration is genuinely
      // unverified, which is the one case fail-closed exists to prevent.
      assert.match(policy, new RegExp(`"\\$\\{${variable}\\}" == "failure"`));
    }
    assert.match(policy, /action=\$\{action\}" >> "\$\{GITHUB_OUTPUT\}"/);

    // Precedence is load-bearing and is expressed by branch order: default to
    // teardown, honour the opt-out, then refuse to preserve anything once a
    // Telegram step has failed, then hold on this run's own proof, and only
    // then fall back to the pre-run baseline.
    const order = [
      /action=teardown/,
      /"\$\{PRESERVE_REQUESTED\}" != "true"/,
      /"\$\{DISABLE_OUTCOME\}" == "failure"/,
      /action=hold/,
      /"\$\{BASELINE_VERIFIED\}" == "true"/,
      /action=restore/,
    ].map((pattern) => policy.search(pattern));
    assert.ok(order.every((index) => index !== -1));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));

    // Holding is licensed by evidence from THIS run, not by the baseline: the
    // live provider was registered and verified, and the trusted configuration
    // was written. A later non-Telegram failure cannot unprove that.
    assert.match(
      policy,
      /"\$\{REGISTER_OUTCOME\}" == "success" &&\n\s*"\$\{ENABLE_OUTCOME\}" == "success" \]\]; then\n\s*(?:#[^\n]*\n\s*)*action=hold/,
    );

    const hold = stepBlock(
      'Hold the live Telegram registration this run already verified',
    );
    assert.match(hold, /\n        id: telegram_hold\n/);
    assert.match(
      hold,
      /if:[^\n]*steps\.telegram_policy\.outputs\.action == 'hold'/,
    );
    // Holding must touch nothing. Re-verifying with the telegram mode would
    // collapse this branch into a teardown of a provably live bot, because
    // that mode is a superset of the installed mode that just failed.
    for (const script of [
      /configure-telegram\.mjs/,
      /verify-telegram-live\.mjs/,
      /verify-production-install\.mjs/,
    ]) {
      assert.doesNotMatch(hold, script);
    }

    // The restore chain is the happy path's own verification, re-run. It ends
    // enabled only if the live provider registered, the trusted configuration
    // was written, and the installed topology verified.
    const chain = [
      ['Restore the verified Telegram gate to a known disabled state', 'telegram_restore_disable', /configure-telegram\.mjs" disabled/],
      ['Restore the verified Telegram provider registration', 'telegram_restore_register', /verify-telegram-live\.mjs" enabled/],
      ['Restore the verified Telegram runtime configuration', 'telegram_restore_enable', /configure-telegram\.mjs" enable/],
      ['Prove the restored Telegram topology before leaving it enabled', 'telegram_restore_verify', /verify-production-install\.mjs" telegram/],
    ];
    const gates = [
      /if:[^\n]*steps\.telegram_policy\.outputs\.action == 'restore'/,
      /if:[^\n]*steps\.telegram_restore_disable\.outcome == 'success'/,
      /if:[^\n]*steps\.telegram_restore_register\.outcome == 'success'/,
      /if:[^\n]*steps\.telegram_restore_enable\.outcome == 'success'/,
    ];
    chain.forEach(([name, id, command], index) => {
      const block = stepBlock(name);
      assert.match(block, new RegExp(`\\n        id: ${id}\\n`));
      assert.match(block, /if:[^\n]*failure\(\)/);
      assert.match(block, gates[index]);
      assert.match(block, command);
      // A half-completed restore must stay a failure so fail-closed still runs.
      assert.doesNotMatch(block, /continue-on-error/);
      assert.doesNotMatch(block, /set \+e/);
      // No opt-in real message may be delivered from a failure path.
      assert.doesNotMatch(block, /CORGI_CRM_TELEGRAM_TEST_DELIVERY/);
    });
    chain.slice(0, -1).forEach(([name], index) => {
      assert.ok(position(name) < position(chain[index + 1][0]));
    });
    assert.ok(
      position('Verify Telegram is disabled') <
        position('Hold the live Telegram registration this run already verified') &&
        position(
          'Hold the live Telegram registration this run already verified',
        ) < position(chain[0][0]) &&
        position(chain.at(-1)[0]) <
          position('Fail closed after Telegram setup failure'),
    );

    // Least privilege is preserved on the restored provider registration: the
    // routing and topic allowlists reach the configuration write only.
    const restoreRegister = stepBlock(
      'Restore the verified Telegram provider registration',
    );
    assert.doesNotMatch(
      restoreRegister,
      /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/,
    );
    assert.doesNotMatch(restoreRegister, /CORGI_CRM_TELEGRAM_GROUP_TOPICS:/);

    // Telegram is never left enabled-but-unverified and never torn down once
    // proven live: on any failure the policy either held a registration this
    // run verified, or the full restore chain verified one, or teardown ran.
    const failClosed = stepBlock('Fail closed after Telegram setup failure');
    assert.match(
      failClosed,
      /if:[^\n]*steps\.telegram_policy\.outputs\.action != 'hold'/,
    );
    assert.match(
      failClosed,
      /if:[^\n]*steps\.telegram_restore_verify\.outcome != 'success'/,
    );
    assert.match(failClosed, /if:[^\n]*inputs\.telegram_enable/);
    assert.match(failClosed, /if:[^\n]*steps\.credential\.outputs\.token != ''/);
  });

  it('keeps real test delivery opt-in behind two independent workflow gates', () => {
    assert.match(workflow, /telegram_test_delivery_enabled/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM/);
    assert.match(workflow, /SEND_TELEGRAM_TEST/);
  });
});
