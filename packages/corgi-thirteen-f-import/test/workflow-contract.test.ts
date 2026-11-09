import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowUrl = new URL(
  '../../../.github/workflows/corgi-thirteen-f-import.yml',
  import.meta.url,
);

test('manual production workflow has the exact OIDC and no-URL contract', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /group: crm-production-deploy/);
  assert.match(
    workflow,
    /https:\/\/admin\.corgiinvest\.com\/api\/internal\/imports\/tony-13f\/export/,
  );
  assert.match(workflow, /CORGI_13F_CREDENTIAL_OPERATION: cleanup/);
  assert.match(workflow, /always\(\).*steps\.acquire\.outcome/);
  assert.doesNotMatch(workflow, /download_url|signed_url|manifest_url/i);
  assert.doesNotMatch(workflow, /upload-artifact|github\.token/);
});
