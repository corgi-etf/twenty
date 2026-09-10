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
const canarySpec = await readFile(
  new URL(
    '../../../../twenty-e2e-testing/tests/production/meetingBooking.maintenance.spec.ts',
    import.meta.url,
  ),
  'utf8',
);

const position = (needle) => {
  const index = workflow.indexOf(needle);
  assert.notEqual(index, -1, `workflow must contain ${needle}`);
  return index;
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
    // The group-topic allowlist must reach both configuration writes, or the
    // staged runtime silently keeps refusing the approved group.
    assert.equal(
      workflow.match(
        /CORGI_CRM_TELEGRAM_GROUP_TOPICS: \$\{\{ secrets\.CORGI_CRM_TELEGRAM_GROUP_TOPICS \}\}/g,
      )?.length,
      2,
    );
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
    const arm = position('\n      - name: Arm the meeting canary alert suppression');
    const canary = position(
      '\n      - name: Verify native CRM meeting booking with alerts suppressed',
    );
    const disarm = position(
      '\n      - name: Disarm the meeting canary alert suppression',
    );
    const configureDisabled = position('Configure Telegram disabled');
    const stage = position('configure-telegram.mjs" stage');
    const register = position(
      '\n      - name: Register and verify the live Telegram provider',
    );
    // The canary used to be pinned between the global Telegram disable and
    // provider registration, because a global kill switch was the only thing
    // stopping its real booking from alerting. The property was never the kill
    // switch itself, it was that the canary cannot emit a booking alert and
    // must run before the provider is brought up. It is now armed suppression
    // that guarantees the first half, so the canary sits before the disable
    // and the bot stays live across it -- but it must still precede
    // registration, and the arm/disarm pair must bracket it exactly.
    assert.ok(
      installed < arm &&
        arm < canary &&
        canary < disarm &&
        disarm < configureDisabled &&
        configureDisabled < stage &&
        stage < register,
    );
    const installedBlock = workflow.slice(installed, arm);
    assert.match(
      installedBlock,
      /if: inputs\.operation == 'configure-telegram'/,
    );
    assert.match(
      installedBlock,
      /CORGI_CRM_EXPECTED_VERSION:\s*\$\{\{ steps\.app\.outputs\.version \}\}/,
    );
    assert.match(installedBlock, /verify-production-install\.mjs" installed/);
    // Arming is mandatory and ungated for exactly the reason the canary is:
    // a skipped arm with a live bot is a real alert to a real channel.
    const armBlock = workflow.slice(arm, canary);
    assert.doesNotMatch(armBlock, /^\s*if:/m);
    assert.match(armBlock, /id: canary_suppression/);
    assert.match(
      armBlock,
      /verify-production-install\.mjs"\s*\n?\s*arm-canary-suppression/,
    );
    // Unchanged property, narrowed to the canary's own block now that other
    // steps sit between it and registration: the canary is mandatory, never
    // operation-gated, never retried and never allowed to swallow a failure.
    const canaryBlock = workflow.slice(canary, disarm);
    assert.doesNotMatch(canaryBlock, /^\s*if:/m);
    assert.doesNotMatch(
      canaryBlock,
      /inputs\.operation == 'publish-and-install'/,
    );
    assert.doesNotMatch(canaryBlock, /if: inputs\.telegram_enable/);
    assert.match(canaryBlock, /CRM_MEETING_CANARY_ENABLED: 'true'/);
    assert.match(
      canaryBlock,
      /VERIFY_NATIVE_CRM_MEETING_WITH_ALERTS_SUPPRESSED/,
    );
    assert.match(canaryBlock, /meetingBooking\.maintenance\.spec\.ts/);
    assert.match(
      canaryBlock,
      /--project=production-chromium --no-deps --retries=0 --reporter=line/,
    );
    assert.doesNotMatch(canaryBlock, /continue-on-error/);
    // A token left armed would silence a genuine booking, so disarming must
    // survive a failed canary. It is gated only on the arm having succeeded,
    // so it can never fail a run that never armed anything.
    const disarmBlock = workflow.slice(disarm, configureDisabled);
    assert.match(
      disarmBlock,
      /if:[^\n]*always\(\) && steps\.canary_suppression\.outcome == 'success'/,
    );
    assert.match(
      disarmBlock,
      /verify-production-install\.mjs"\s*\n?\s*disarm-canary-suppression/,
    );
    assert.doesNotMatch(disarmBlock, /continue-on-error/);
  });

  it('keeps the canary alert suppression run-scoped and self-expiring', () => {
    // The armed token is the only thing standing between a canary booking and
    // a real "NEW MEETING BOOKED" alert now that the bot stays live. It must
    // be bound to this exact run and expire on its own, so a lost disarm
    // cannot silence a genuine booking indefinitely.
    assert.match(verifier, /CORGI_CRM_MEETING_CANARY_SUPPRESSION/);
    assert.match(
      verifier,
      /namePrefix: `CRM meeting canary \$\{runId\}-\$\{runAttempt\}-`/,
    );
    assert.match(verifier, /notAfter: new Date\(now \+ MEETING_CANARY_SUPPRESSION_WINDOW_MS\)/);
    assert.match(
      verifier,
      /MEETING_CANARY_SUPPRESSION_WINDOW_MS = 20 \* 60_000/,
    );
    assert.match(verifier, /\/\^\[1-9\]\[0-9\]\*\$\/\.test\(runId \?\? ''\)/);
    assert.match(
      verifier,
      /\/\^\[1-9\]\[0-9\]\*\$\/\.test\(runAttempt \?\? ''\)/,
    );
    // Disarming has to stay reachable when something unrelated is broken.
    assert.match(
      verifier,
      /if \(mode === 'disarm-canary-suppression'\)[\s\S]*?\n  await verifyRequiredSchema/,
    );

    // Three independent places must agree or suppression silently stops
    // working with the bot live: the prefix the arming step writes, the prefix
    // the canary names its meeting with, and the prefix the canary re-proves
    // is armed before each mutation.
    assert.match(
      canarySpec,
      /const MEETING_CANARY_NAME_PREFIX = `CRM meeting canary \$\{requiredEnvironment\('GITHUB_RUN_ID'\)\}-\$\{requiredEnvironment\('GITHUB_RUN_ATTEMPT'\)\}-`/,
    );
    assert.match(
      canarySpec,
      /const meetingName = `\$\{MEETING_CANARY_NAME_PREFIX\}\$\{nameNonce\}`/,
    );
    assert.match(
      canarySpec,
      /variable\.key === 'CORGI_CRM_MEETING_CANARY_SUPPRESSION'/,
    );
    assert.match(
      canarySpec,
      /expect\(token\.namePrefix\)\.toBe\(MEETING_CANARY_NAME_PREFIX\)/,
    );
    assert.match(
      canarySpec,
      /expect\(Date\.parse\(token\.notAfter as string\) > Date\.now\(\)\)\.toBe\(true\)/,
    );
    // The canary must no longer require the bot to be off, and must not be
    // able to run against a release that never armed its suppression.
    assert.doesNotMatch(canarySpec, /'CORGI_CRM_TELEGRAM_ENABLED', 'false'/);
    assert.match(
      canarySpec,
      /'VERIFY_NATIVE_CRM_MEETING_WITH_ALERTS_SUPPRESSED'/,
    );
    assert.match(
      workflow,
      /CRM_MEETING_CANARY_CONFIRMATION: VERIFY_NATIVE_CRM_MEETING_WITH_ALERTS_SUPPRESSED/,
    );
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
    // Recovery locates the prior run's leaked meeting by the step that created
    // it. It must accept the pre-suppression step name too, or a meeting leaked
    // before the canary stopped needing the bot off becomes unrecoverable.
    assert.match(
      recovery,
      /Verify native CRM meeting booking with alerts suppressed/,
    );
    assert.match(
      recovery,
      /Verify native CRM meeting booking while Telegram is disabled/,
    );
    assert.match(
      recovery,
      /select\(\.name == \$step_name or \.name == \$legacy_step_name\)/,
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
        '\n      - name: Verify native CRM meeting booking with alerts suppressed',
      ),
      position(
        '\n      - name: Disarm the meeting canary alert suppression',
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

  it('keeps real test delivery opt-in behind two independent workflow gates', () => {
    assert.match(workflow, /telegram_test_delivery_enabled/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM/);
    assert.match(workflow, /SEND_TELEGRAM_TEST/);
  });
});
