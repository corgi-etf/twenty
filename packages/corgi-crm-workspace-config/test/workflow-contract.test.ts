import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowPath = new URL(
  '../../../.github/workflows/crm-workspace-config.yml',
  import.meta.url,
);
const discoveryWorkflowPath = new URL(
  '../../../.github/workflows/crm-territory-identity-discovery.yml',
  import.meta.url,
);
const discoverySpecPath = new URL(
  '../../twenty-e2e-testing/tests/production/workspaceTerritoryIdentityDiscovery.maintenance.spec.ts',
  import.meta.url,
);

test('workspace configuration requires the exact deployed workflow revision', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(
    workflow,
    /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
  );
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$\{DEPLOYED_SHA\}" "\$\{cleanup_head_sha\}"/,
  );
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$\{cleanup_head_sha\}" "\$\{GITHUB_SHA\}"/,
  );
  for (const identity of ['grace', 'kelly', 'nash']) {
    assert.match(
      workflow,
      new RegExp(
        `${identity}_workspace_member_id:[\\s\\S]*?required: true[\\s\\S]*?type: string`,
      ),
    );
    assert.match(
      workflow,
      new RegExp(
        `CRM_${identity.toUpperCase()}_WORKSPACE_MEMBER_ID: \\$\\{\\{ inputs\\.${identity}_workspace_member_id \\}\\}`,
      ),
    );
  }
});

test('territory identity discovery is read-only and bound to the exact live revision', async () => {
  const [workflow, discoverySpec] = await Promise.all([
    readFile(discoveryWorkflowPath, 'utf8'),
    readFile(discoverySpecPath, 'utf8'),
  ]);

  assert.match(
    workflow,
    /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
  );
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /CRM_E2E_LOGIN: \$\{\{ secrets\.CRM_E2E_LOGIN \}\}/);
  assert.match(workflow, /CRM_TERRITORY_IDENTITY_DISCOVERY_ENABLED: 'true'/);
  assert.match(
    workflow,
    /workspaceTerritoryIdentityDiscovery\.maintenance\.spec\.ts/,
  );
  assert.match(workflow, /assert_stable_service_tasks "\$\{SERVER_SERVICE\}"/);
  assert.match(workflow, /assert_stable_service_tasks "\$\{WORKER_SERVICE\}"/);
  assert.match(
    workflow,
    /path: \$\{\{ runner\.temp \}\}\/crm-territory-identity-discovery\/workspace-member-identities\.json/,
  );
  assert.doesNotMatch(
    workflow,
    /ecs update-service|ecr put-image|conditionalPatch|Apply fail-closed/,
  );

  assert.match(discoverySpec, /assertWorkspaceConfigTenant/);
  assert.match(discoverySpec, /createTwentyTerritoryIdentityDiscoveryApi/);
  assert.doesNotMatch(
    discoverySpec,
    /createTwentyWorkspaceConfigApi|conditionalPatch|createMetadata|updateMetadata|deleteView/,
  );
});
