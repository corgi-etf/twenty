import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowUrl = new URL(
  '../../../.github/workflows/corgi-thirteen-f-import.yml',
  import.meta.url,
);

test('manual production workflow normalizes only CRM attachments', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /group: crm-production-deploy/);
  assert.match(workflow, /IMPORT_TONY_13F_FILES/);
  assert.match(workflow, /RELEASE_SHA.*GITHUB_SHA/s);
  assert.match(
    workflow,
    /Download CRM attachments and converge normalized holdings/,
  );
  assert.match(workflow, /packages\/corgi-thirteen-f-import\/src\/cli\.ts/);
  assert.match(workflow, /CORGI_13F_IMPORT_KEY_PATH/);
  assert.match(workflow, /CORGI_13F_IMPORT_RESULT_PATH/);
  assert.match(workflow, /CORGI_13F_CREDENTIAL_OPERATION: cleanup/);
  assert.match(workflow, /always\(\).*steps\.acquire\.outcome/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /CORGI_13F_EXPORT_AUDIENCE/);
  assert.doesNotMatch(workflow, /ACTIONS_ID_TOKEN/);
  assert.doesNotMatch(
    workflow,
    /admin\.corgiinvest\.com\/api\/internal\/imports\/tony-13f\/export/,
  );
  assert.doesNotMatch(workflow, /download_url|signed_url|manifest_url/i);
  assert.doesNotMatch(workflow, /upload-artifact|github\.token/);
});

test('publishes only the aggregate schema-version-two receipt', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /select\(\.schemaVersion == 2\)/);
  for (const field of [
    'schemaVersion',
    'aggregateContentSha256',
    'sourceFiles',
    'sourceBytes',
    'supportedFiles',
    'unsupportedFiles',
    'acceptedRows',
    'rejectedRows',
    'ignoredRows',
    'managerRecords',
    'securityRecords',
    'holdingRecords',
    'importRuns',
    'importErrors',
    'noOpFiles',
    'supersededRows',
  ]) {
    assert.match(workflow, new RegExp(`\\b${field}\\b`));
  }
  for (const obsoleteField of [
    'manifestSha256',
    'created',
    'metadataUpdated',
    'repaired',
    'verified',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(`\\b${obsoleteField}\\b`));
  }
  assert.match(workflow, /rm -f.*corgi-13f-import-result\.json/);
});
