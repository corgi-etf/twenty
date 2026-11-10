import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowUrl = new URL(
  '../../../.github/workflows/corgi-thirteen-f-import.yml',
  import.meta.url,
);

test('manual production workflow migrates normalized rows through GitHub OIDC', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /MIGRATE_NORMALIZED_13F/);
  assert.match(workflow, /RELEASE_SHA.*GITHUB_SHA/s);
  assert.match(workflow, /packages\/corgi-thirteen-f-import\/src\/cli\.ts/);
  assert.match(workflow, /CORGI_13F_IMPORT_KEY_PATH/);
  assert.match(workflow, /CORGI_13F_IMPORT_RESULT_PATH/);
  assert.match(workflow, /CORGI_13F_CREDENTIAL_OPERATION: cleanup/);
  assert.match(workflow, /always\(\).*steps\.acquire\.outcome/);
});

test('workflow retains only the aggregate schema-three receipt', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /select\(\.schemaVersion == 3\)/);
  for (const field of [
    'sourceSystem',
    'coverage',
    'contentSha256',
    'sourceRows',
    'acceptedRows',
    'duplicateRows',
    'rejectedRows',
    'rejectionCounts',
    'companyMappingCounts',
    'normalizedCounts',
    'batchId',
    'status',
    'receivedCounts',
    'published',
    'completedAt',
  ]) {
    assert.match(workflow, new RegExp(`\\b${field}\\b`));
  }
  for (const forbidden of [
    'attachment',
    'workbook',
    'sourceFile',
    'sourceBytes',
    'download_url',
    'signed_url',
    'manifest_url',
    'upload-artifact',
    'companyMappings',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbidden, 'i'), forbidden);
  }
  assert.match(workflow, /rm -f.*corgi-13f-import-result\.json/);
  assert.match(workflow, /rm -f.*corgi-13f-import-key\.json/);
});
