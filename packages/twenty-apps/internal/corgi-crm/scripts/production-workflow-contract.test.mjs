import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

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

describe('Corgi CRM production app workflow contract', () => {
  it('derives the workspace ID from integrity-validated bootstrap evidence without a UUID literal', () => {
    assert.doesNotMatch(
      workflow,
      /CORGI_CRM_EXPECTED_WORKSPACE_ID:\s+[0-9a-f-]{36}/i,
    );
    assert.doesNotMatch(workflow, /APPROVED_(USER_)?WORKSPACE_ID/);
    assert.doesNotMatch(verifier, /APPROVED_(USER_)?WORKSPACE_ID/);
    assert.match(workflow, /CRM_WORKSPACE_ENV_PATH:\s*\$\{\{ github\.env \}\}/);
    assert.match(bootstrapSpec, /assertCompletedWorkspaceMetadataBootstrap/);
    assert.match(bootstrapSpec, /validated\.workspaceId/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
  });

  it('resolves build-time role identifiers after acquiring the key and before publish', () => {
    const acquire = position('Acquire a short-lived deployment API key');
    const roleEnv = position('verify-production-install.mjs" role-env');
    const publish = position('Publish the private Corgi CRM app');
    assert.ok(acquire < roleEnv && roleEnv < publish);
    assert.match(workflow, /CORGI_CRM_ROLE_ENV_PATH:\s*\$\{\{ github\.env \}\}/);
  });

  it('prevalidates trusted config, verifies the exact provider contract, then enables Telegram', () => {
    const configureDisabled = position('configure-telegram.mjs" disabled');
    const stage = position('configure-telegram.mjs" stage');
    const liveVerify = position('verify-telegram-live.mjs" enabled');
    const enable = position('configure-telegram.mjs" enable');
    const installVerify = position('verify-production-install.mjs" telegram');
    assert.ok(configureDisabled < stage && stage < liveVerify && liveVerify < enable);
    assert.ok(enable < installVerify);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_LINK_CODES:\s*\$\{\{ secrets\./);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM:\s*RUN_SIGNED_CANARY/);
  });

  it('always disables and unregisters on opt-out, with idempotent failure cleanup', () => {
    assert.match(workflow, /Configure Telegram disabled[\s\S]*if:[^\n]*always\(\)/);
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

  it('keeps real test delivery opt-in behind two independent workflow gates', () => {
    assert.match(workflow, /telegram_test_delivery_enabled/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM/);
    assert.match(workflow, /SEND_TELEGRAM_TEST/);
  });
});
