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
const bootstrapWorkflowPath = new URL(
  '../../../.github/workflows/crm-workspace-metadata-bootstrap.yml',
  import.meta.url,
);
const appWorkflowPath = new URL(
  '../../../.github/workflows/corgi-crm-app-production.yml',
  import.meta.url,
);
const bootstrapSpecPath = new URL(
  '../../twenty-e2e-testing/tests/production/workspaceMetadataBootstrap.maintenance.spec.ts',
  import.meta.url,
);
const discoverySpecPath = new URL(
  '../../twenty-e2e-testing/tests/production/workspaceTerritoryIdentityDiscovery.maintenance.spec.ts',
  import.meta.url,
);
const workspaceConfigSpecPath = new URL(
  '../../twenty-e2e-testing/tests/production/workspaceConfiguration.maintenance.spec.ts',
  import.meta.url,
);

test('workspace configuration requires the exact deployed workflow revision', async () => {
  const [workflow, workspaceConfigSpec] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(workspaceConfigSpecPath, 'utf8'),
  ]);

  assert.match(
    workflow,
    /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
  );
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$\{cleanup_head_sha\}" "\$\{DEPLOYED_SHA\}"/,
  );
  assert.doesNotMatch(
    workflow,
    /git merge-base --is-ancestor "\$\{DEPLOYED_SHA\}" "\$\{cleanup_head_sha\}"/,
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
  assert.match(workflow, /crm-territory-member-identities-/);
  assert.match(workflow, /CRM_TERRITORY_IDENTITY_ARTIFACT_PATH/);
  assert.match(workflow, /\.head_sha == \$deployed_sha/);
  assert.match(
    workspaceConfigSpec,
    /assertCompletedTerritoryIdentityDiscovery/,
  );
});

test('metadata bootstrap is exact-SHA, metadata-only, and precedes app preflight', async () => {
  const [bootstrapWorkflow, bootstrapSpec, appWorkflow] = await Promise.all([
    readFile(bootstrapWorkflowPath, 'utf8'),
    readFile(bootstrapSpecPath, 'utf8'),
    readFile(appWorkflowPath, 'utf8'),
  ]);

  assert.match(
    bootstrapWorkflow,
    /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
  );
  assert.match(
    bootstrapWorkflow,
    /Verify the completed metadata-cleanup workflow lineage/,
  );
  assert.match(
    bootstrapWorkflow,
    /git merge-base --is-ancestor "\$\{cleanup_sha\}" "\$\{DEPLOYED_SHA\}"/,
  );
  assert.doesNotMatch(
    bootstrapWorkflow,
    /git merge-base --is-ancestor "\$\{DEPLOYED_SHA\}" "\$\{cleanup_sha\}"/,
  );
  assert.match(
    bootstrapWorkflow,
    /workspaceMetadataBootstrap\.maintenance\.spec\.ts/,
  );
  assert.match(bootstrapWorkflow, /crm-workspace-metadata-bootstrap-/);
  assert.doesNotMatch(
    bootstrapSpec,
    /runWorkspaceConfiguration|listCompanies|listWholesalers|conditionalPatch|createView|updateView|deleteView|Navigation/,
  );
  assert.match(bootstrapSpec, /createTwentyWorkspaceMetadataBootstrapApi/);
  assert.match(bootstrapSpec, /runWorkspaceMetadataBootstrap/);

  const bootstrapLineagePosition = appWorkflow.indexOf(
    'Verify exact-SHA metadata bootstrap lineage',
  );
  const bootstrapEvidencePosition = appWorkflow.indexOf(
    'Verify metadata bootstrap before app preflight',
  );
  const appPreflightPosition = appWorkflow.indexOf(
    'Verify the authenticated production workspace',
  );
  const appInstallPosition = appWorkflow.indexOf(
    'Publish the private Corgi CRM app',
  );
  assert.ok(bootstrapLineagePosition > 0);
  assert.ok(bootstrapEvidencePosition > bootstrapLineagePosition);
  assert.ok(appPreflightPosition > bootstrapEvidencePosition);
  assert.ok(appInstallPosition > appPreflightPosition);
  assert.match(appWorkflow, /\.head_sha == \$deployed_sha/);
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
  assert.match(workflow, /Verify exact-SHA app install lineage/);
  assert.match(workflow, /\.head_sha == \$deployed_sha/);
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
