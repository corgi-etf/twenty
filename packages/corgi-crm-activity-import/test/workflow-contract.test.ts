import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowPath = new URL(
  '../../../.github/workflows/crm-outreach-activity-import.yml',
  import.meta.url,
);
const maintenanceSpecPath = new URL(
  '../../twenty-e2e-testing/tests/production/activityImport.maintenance.spec.ts',
  import.meta.url,
);
const importerPath = new URL('../src/importer.ts', import.meta.url);
const restApiPath = new URL('../src/twenty-rest-api.ts', import.meta.url);

test('workflow is exact-SHA, serialized, two-phase, and secret-backed', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /group: crm-production-deploy/);
  assert.match(
    workflow,
    /\[\[ "\$\{DEPLOYED_SHA\}" == "\$\{GITHUB_SHA\}" \]\]/,
  );
  assert.match(
    workflow,
    /Prove every live task uses the exact import revision/,
  );
  assert.match(workflow, /assert_stable_service_tasks "\$\{SERVER_SERVICE\}"/);
  assert.match(workflow, /assert_stable_service_tasks "\$\{WORKER_SERVICE\}"/);
  assert.match(workflow, /mode:[\s\S]*?dry-run[\s\S]*?apply/);
  assert.match(workflow, /IMPORT_CRM_OUTREACH_ACTIVITIES/);
  assert.match(workflow, /CRM_ACTIVITY_IMPORT_CSV_BASE64/);
  assert.match(workflow, /base64 --decode/);
  assert.match(workflow, /source_sha256:/);
  assert.match(workflow, /expected_rows:/);
  assert.match(workflow, /activity_date:/);
  assert.match(workflow, /time_zone:/);
  assert.match(workflow, /import_id:/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /--retries=0/);
  assert.doesNotMatch(
    workflow,
    /d0c00183b467ef4a8e03c7307edf9af28fadbe6eddaadb1b1e30ee3c3438051f/,
  );
  assert.doesNotMatch(workflow, /Nash - Calls|Sheet1\.csv|expected_rows:\s*63/);
});

test('Nash ownership comes only from authenticated identity-discovery evidence', async () => {
  const [workflow, maintenanceSpec, importer] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(maintenanceSpecPath, 'utf8'),
    readFile(importerPath, 'utf8'),
  ]);

  assert.match(
    workflow,
    /Verify authenticated exact-SHA identity artifact lineage/,
  );
  assert.match(workflow, /crm-territory-member-identities-/);
  assert.match(workflow, /\.head_sha == \$sha/);
  assert.match(workflow, /\.digest[\s\S]*?sha256:/);
  assert.match(maintenanceSpec, /assertTerritoryIdentityArtifact/);
  assert.match(importer, /identityArtifact\.workspaceMemberIds\.Nash/);
  assert.doesNotMatch(
    `${workflow}\n${maintenanceSpec}\n${importer}`,
    /NASH_WORKSPACE_MEMBER_ID|nashWorkspaceMemberId:\s*['"][0-9a-f-]+/,
  );
});

test('runtime is create-only, collision-checked, and uploads no source PII', async () => {
  const [workflow, maintenanceSpec, importer, restApi] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(maintenanceSpecPath, 'utf8'),
    readFile(importerPath, 'utf8'),
    readFile(restApiPath, 'utf8'),
  ]);

  assert.match(importer, /must match exactly one company/);
  assert.match(importer, /deterministic activity ID collision/);
  assert.match(importer, /activityType: 'call'/);
  assert.match(importer, /contactId: record\.contactId \?\? null/);
  assert.match(importer, /outcome: record\.outcome \?\? null/);
  assert.match(restApi, /restUrl\('outreachActivities'\)/);
  assert.doesNotMatch(restApi, /upsert=true/);
  assert.match(maintenanceSpec, /runActivityImport/);
  assert.match(workflow, /Delete private source and identity material/);
  const upload = workflow.slice(
    workflow.indexOf('Upload the PII-free manifest and checkpoint'),
  );
  assert.doesNotMatch(
    upload,
    /private|activities\.csv|workspace-member-identities/,
  );
  assert.match(upload, /activity-import-checkpoint\.json/);
  assert.match(upload, /activity-import-result\.json/);
});
