import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflowPath = new URL(
  '../../../.github/workflows/crm-workspace-config.yml',
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
