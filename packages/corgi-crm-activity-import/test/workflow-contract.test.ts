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
const rootPackagePath = new URL('../../../package.json', import.meta.url);
const yarnLockPath = new URL('../../../yarn.lock', import.meta.url);

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
  assert.match(workflow, /source_format:/);
  assert.match(workflow, /legacy-nash-outreach-v1/);
  assert.match(workflow, /completed-actions-v2/);
  assert.match(workflow, /owner_label:/);
  assert.match(
    workflow,
    /owner_label:[\s\S]*?default: select-owner[\s\S]*?options:[\s\S]*?- select-owner[\s\S]*?- Grace[\s\S]*?- Kelly[\s\S]*?- Nash/,
  );
  assert.match(
    workflow,
    /\[\[ "\$\{OWNER_LABEL\}" == "Grace" \|\| "\$\{OWNER_LABEL\}" == "Kelly" \|\| "\$\{OWNER_LABEL\}" == "Nash" \]\]/,
  );
  assert.match(workflow, /provenance_sha256:/);
  assert.match(workflow, /expected_row_sequence_sha256:/);
  assert.match(workflow, /source_sha256:/);
  assert.match(workflow, /expected_rows:/);
  assert.match(workflow, /expected_source_rows:/);
  assert.match(workflow, /expected_phone_calls:/);
  assert.match(workflow, /expected_voicemails:/);
  assert.match(workflow, /expected_emails:/);
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
  assert.doesNotMatch(workflow, /expected_rows:\s*(25|36)/);
});

test('v2 approval binds the complete PII-free normalization receipt', async () => {
  const [workflow, maintenanceSpec] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(maintenanceSpecPath, 'utf8'),
  ]);

  for (const environmentName of [
    'CRM_ACTIVITY_IMPORT_EXPECTED_SOURCE_ROWS',
    'CRM_ACTIVITY_IMPORT_EXPECTED_PHONE_CALLS',
    'CRM_ACTIVITY_IMPORT_EXPECTED_VOICEMAILS',
    'CRM_ACTIVITY_IMPORT_EXPECTED_EMAILS',
  ]) {
    assert.match(workflow, new RegExp(environmentName));
    assert.match(maintenanceSpec, new RegExp(environmentName));
  }
  for (const receiptField of [
    'sourceDocumentSha256',
    'normalizedCsvSha256',
    'rowSequenceSha256',
    'sourceRowCount',
    'activityCount',
    'phoneCallCount',
    'voicemailCount',
    'emailCount',
  ]) {
    assert.match(
      workflow,
      new RegExp(`normalizationReceipt[\\s\\S]*?${receiptField}`),
    );
  }
});

test('ownership is explicit, authenticated, and legacy Nash remains fail-closed', async () => {
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
  assert.match(
    importer,
    /identityArtifact\.workspaceMemberIds\[input\.csvOptions\.ownerLabel\]/,
  );
  assert.match(importer, /legacy source owner must be Nash/);
  assert.match(maintenanceSpec, /CRM_ACTIVITY_IMPORT_OWNER_LABEL/);
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
  assert.match(importer, /activityType: row\.activityType/);
  assert.match(importer, /contactId: record\.contactId \?\? null/);
  assert.match(importer, /outcome: record\.outcome \?\? null/);
  assert.match(restApi, /restUrl\('outreachActivities'\)/);
  assert.doesNotMatch(restApi, /upsert=true/);
  assert.match(maintenanceSpec, /runActivityImport/);
  assert.match(workflow, /Delete private source and identity material/);
  const deletePosition = workflow.indexOf(
    'Delete private source and identity material',
  );
  const uploadPosition = workflow.indexOf(
    'Upload the PII-free manifest and checkpoint',
  );
  assert.ok(deletePosition > 0);
  assert.ok(uploadPosition > deletePosition);
  const upload = workflow.slice(uploadPosition);
  assert.match(
    upload,
    /if:.*always\(\).*private_cleanup\.outcome == 'success'/,
  );
  assert.doesNotMatch(
    upload,
    /\/private\/|activities\.csv|workspace-member-identities/,
  );
  assert.match(upload, /activity-import-checkpoint\.json/);
  assert.match(upload, /activity-import-result\.json/);
  assert.doesNotMatch(workflow, /PDF_BASE64|source\.pdf|unchecked/);
});

test('package is a locked root workspace for immutable installs', async () => {
  const [rootPackage, yarnLock] = await Promise.all([
    readFile(rootPackagePath, 'utf8'),
    readFile(yarnLockPath, 'utf8'),
  ]);

  const root = JSON.parse(rootPackage) as {
    workspaces?: { packages?: string[] };
  };
  assert.ok(
    root.workspaces?.packages?.includes('packages/corgi-crm-activity-import'),
  );
  assert.match(
    yarnLock,
    /"corgi-crm-activity-import@workspace:packages\/corgi-crm-activity-import"/,
  );
});
