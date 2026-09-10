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
    assert.match(prerequisite, /Verify authenticated tenant environment handoff/);
    assert.match(prerequisite, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(prerequisite, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
    assert.match(bootstrapSpec, /assertCompletedWorkspaceMetadataBootstrap/);
    assert.match(bootstrapSpec, /validated\.workspaceId/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
  });

  it('resolves build-time role identifiers after acquiring the key and before publish', () => {
    const acquire = position('Acquire a short-lived deployment API key');
    const roleStep = position('Resolve least-privilege role object identifiers');
    const roleEnv = position('verify-production-install.mjs" role-env');
    const publish = position('Publish the private Corgi CRM app');
    assert.ok(acquire < roleEnv && roleEnv < publish);
    assert.doesNotMatch(
      workflow,
      /CORGI_CRM_ROLE_ENV_PATH:\s*\$\{\{ github\.env \}\}/,
    );
    const roleHandoff = workflow.slice(roleStep, publish);
    assert.match(
      roleHandoff,
      /export CORGI_CRM_ROLE_ENV_PATH="\$GITHUB_ENV"/,
    );
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

  it(
    'exports tenant and role identifiers to the current runner environment file',
    async (testContext) => {
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
    },
  );

  it('prevalidates trusted config, verifies the exact provider contract, then enables Telegram', () => {
    const configureDisabled = position('configure-telegram.mjs" disabled');
    const stage = position('configure-telegram.mjs" stage');
    const liveVerify = position('verify-telegram-live.mjs" enabled');
    const enable = position('configure-telegram.mjs" enable');
    const installVerify = position('verify-production-install.mjs" telegram');
    assert.ok(configureDisabled < stage && stage < liveVerify && liveVerify < enable);
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
    assert.doesNotMatch(providerBlock, /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/);
    assert.match(enableBlock, /CORGI_CRM_TELEGRAM_NOTIFICATION_ROUTES:/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM:\s*RUN_SIGNED_CANARY/);
  });

  it('always disables and unregisters on opt-out, with idempotent failure cleanup', () => {
    assert.match(workflow, /Configure Telegram disabled[\s\S]*if:[^\n]*always\(\)/);
    const disabledBlock = workflow.slice(
      position('Configure Telegram disabled'),
      position('Unregister Telegram provider'),
    );
    assert.match(
      disabledBlock,
      /CORGI_CRM_TELEGRAM_TIME_ZONE:\s*\$\{\{ vars\./,
    );
    assert.doesNotMatch(disabledBlock, /CORGI_CRM_TELEGRAM_BOT_TOKEN/);
    assert.match(workflow, /Unregister Telegram provider[\s\S]*if:[^\n]*!inputs\.telegram_enable/);
    assert.match(workflow, /verify-telegram-live\.mjs" disabled/);
    assert.match(workflow, /Fail closed after Telegram setup failure[\s\S]*if:[^\n]*failure\(\)/);
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

  it('gates app installation on native meeting verification before provider activation', () => {
    const stage = position('configure-telegram.mjs" stage');
    const canary = position('Verify native CRM meeting booking while Telegram is disabled');
    const register = position('Register and verify the live Telegram provider');
    assert.ok(stage < canary && canary < register);
    const canaryBlock = workflow.slice(canary, register);
    assert.match(canaryBlock, /if: inputs\.operation == 'publish-and-install'/);
    assert.doesNotMatch(canaryBlock, /if: inputs\.telegram_enable/);
    assert.match(canaryBlock, /CRM_MEETING_CANARY_ENABLED: 'true'/);
    assert.match(canaryBlock, /VERIFY_NATIVE_CRM_MEETING_WITH_TELEGRAM_DISABLED/);
    assert.match(canaryBlock, /meetingBooking\.maintenance\.spec\.ts/);
    assert.match(canaryBlock, /--project=production-chromium --no-deps --retries=0/);
    assert.doesNotMatch(canaryBlock, /continue-on-error/);
  });

  it('keeps real test delivery opt-in behind two independent workflow gates', () => {
    assert.match(workflow, /telegram_test_delivery_enabled/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM/);
    assert.match(workflow, /SEND_TELEGRAM_TEST/);
  });
});
