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
    assert.doesNotMatch(workflow, /APPROVED_WORKSPACE_ID/);
    assert.doesNotMatch(verifier, /APPROVED_WORKSPACE_ID/);
    assert.doesNotMatch(
      verifier,
      /eabf5d9d-fc99-4acb-b160-710ecb1db996/i,
    );
    assert.match(workflow, /CRM_WORKSPACE_ENV_PATH:\s*\$\{\{ github\.env \}\}/);
    assert.match(bootstrapSpec, /assertCompletedWorkspaceMetadataBootstrap/);
    assert.match(bootstrapSpec, /validated\.workspaceId/);
    assert.match(bootstrapSpec, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
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
    const liveVerify = position('verify-telegram-live.mjs');
    const enable = position('configure-telegram.mjs" enable');
    const installVerify = position('verify-production-install.mjs" telegram');
    assert.ok(configureDisabled < liveVerify && liveVerify < enable);
    assert.ok(enable < installVerify);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_LINK_CODES:\s*\$\{\{ secrets\./);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_SIGNED_CANARY_CONFIRM:\s*RUN_SIGNED_CANARY/);
  });

  it('keeps real test delivery opt-in behind two independent workflow gates', () => {
    assert.match(workflow, /telegram_test_delivery_enabled/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_ENABLED/);
    assert.match(workflow, /CORGI_CRM_TELEGRAM_TEST_DELIVERY_CONFIRM/);
    assert.match(workflow, /SEND_TELEGRAM_TEST/);
  });
});
