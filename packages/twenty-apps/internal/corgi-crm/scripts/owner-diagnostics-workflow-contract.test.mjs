import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workflow = await readFile(
  new URL(
    '../../../../../.github/workflows/crm-owner-diagnostics.yml',
    import.meta.url,
  ),
  'utf8',
);

const position = (needle) => {
  const index = workflow.indexOf(needle);

  assert.notEqual(index, -1, `workflow must contain ${needle}`);

  return index;
};

describe('CRM owner diagnostics workflow contract', () => {
  it('requires an explicit main-only production approval for an ancestor deployment', () => {
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /group: crm-production-deploy/);
    assert.match(
      workflow,
      /CONFIRMATION[\s\S]*INSPECT_CRM_OWNER_RECONCILIATION/,
    );
    assert.match(
      workflow,
      /\[\[ "\$\{DEPLOYED_SHA\}" =~ \^\[0-9a-f\]\{40\}\$ \]\]/,
    );
    assert.match(
      workflow,
      /git merge-base --is-ancestor "\$\{DEPLOYED_SHA\}" "\$\{GITHUB_SHA\}"/,
    );
    assert.doesNotMatch(
      workflow,
      /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
    );
  });

  it('pins bootstrap evidence to the deployed SHA and authenticates the tenant', () => {
    const lineage = workflow.slice(
      position('Verify deployed-SHA metadata bootstrap lineage'),
      position('Configure immediate AWS deployment inspection'),
    );

    assert.match(lineage, /crm-workspace-metadata-bootstrap\.yml/);
    assert.match(lineage, /\.head_sha == \$deployed_sha/);
    assert.match(lineage, /\.conclusion == "success"/);
    assert.match(
      lineage,
      /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/,
    );
    assert.match(
      workflow,
      /workspaceMetadataBootstrapPrerequisite\.production\.spec\.ts/,
    );
    assert.match(
      workflow,
      /export CRM_WORKSPACE_ENV_PATH="\$GITHUB_ENV"/,
    );
    assert.match(workflow, /CORGI_CRM_EXPECTED_WORKSPACE_ID/);
    assert.match(workflow, /CORGI_CRM_EXPECTED_USER_WORKSPACE_ID/);
  });

  it('proves the exact live image and stable local-function runtime before inspection', () => {
    const runtimeGuard = workflow.slice(
      position('Prove every live task uses the approved deployed SHA and runtime configuration'),
      position('Verify metadata bootstrap before owner diagnostics'),
    );

    assert.match(runtimeGuard, /aws sts get-caller-identity/);
    assert.match(runtimeGuard, /imageTag=git-\$\{DEPLOYED_SHA\}/);
    assert.match(runtimeGuard, /imageDigest == \$digest/);
    assert.match(runtimeGuard, /LOGIC_FUNCTION_TYPE/);
    assert.match(runtimeGuard, /CODE_INTERPRETER_TYPE/);
    assert.match(runtimeGuard, /SERVER_SERVICE/);
    assert.match(runtimeGuard, /WORKER_SERVICE/);
  });

  it('runs only the read-only target verifier with a masked short-lived key', () => {
    const acquire = position('Acquire a short-lived diagnostic API key');
    const mask = position('Mask the diagnostic token for subsequent steps');
    const inspect = position('Inspect owner reconciliation filters');
    const revoke = position('Revoke the short-lived diagnostic API key');

    assert.ok(acquire < mask && mask < inspect && inspect < revoke);
    assert.match(workflow, /role-duration-seconds: 1800/);
    assert.match(workflow, /::add-mask::\$\{token\}/);
    assert.match(
      workflow,
      /verify-production-install\.mjs" target/,
    );
    assert.doesNotMatch(workflow, /verify-production-install\.mjs" role-env/);
    assert.doesNotMatch(workflow, /deploy-twenty-app|install-twenty-app/);
    assert.doesNotMatch(
      workflow,
      /configure-telegram\.mjs|verify-telegram-live\.mjs|CORGI_CRM_TELEGRAM_/,
    );
    assert.doesNotMatch(
      workflow,
      /aws ecs (update-service|run-task)|terraform (apply|destroy)/,
    );
  });

  it('always revokes the key and removes local authentication artifacts', () => {
    const cleanup = workflow.slice(
      position('Revoke the short-lived diagnostic API key'),
    );

    assert.match(cleanup, /if: always\(\)/);
    assert.match(cleanup, /CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke/);
    assert.match(cleanup, /corgiCrmAppDeploymentKey\.production\.spec\.ts/);
    assert.match(
      cleanup,
      /rm -f "\$\{RUNNER_TEMP\}\/corgi-crm-deployment-key\.json"/,
    );
    assert.match(cleanup, /rm -f \/home\/runner\/\.twenty\/config\.json/);
    assert.match(cleanup, /rm -f packages\/twenty-e2e-testing\/\.auth\/production-user\.json/);
  });
});
