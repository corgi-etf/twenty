import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const WORKFLOW_PATH = new URL(
  '../../../.github/workflows/crm-activity-type-inventory.yml',
  import.meta.url,
);

const workflow = async () => readFile(WORKFLOW_PATH, 'utf8');

// A workflow that touches Telegram configuration inherits the always()-guarded
// Unregister step in corgi-crm-app-production.yml, which tears down the live
// webhook on any run that does not opt back in. This one must stay incapable of
// that, so the absence is asserted rather than merely observed.
test('never mentions Telegram in any form', async () => {
  assert.doesNotMatch(await workflow(), /telegram/i);
});

test('reads production only, with no mode or execute input', async () => {
  const source = await workflow();

  assert.doesNotMatch(source, /^\s+mode:/m);
  assert.doesNotMatch(source, /execute:/);
  assert.doesNotMatch(source, /conditionalPatch/);
  assert.doesNotMatch(source, /activity-type-backfill/);
  assert.match(source, /corgi-crm-workspace-config:activity-type-inventory/);
});

test('grants no write permission beyond the OIDC token', async () => {
  const source = await workflow();
  const permissions = /permissions:\n((?:\s{2}\S.*\n)+)/.exec(source)?.[1];

  assert.ok(permissions);
  assert.match(permissions, /actions: read/);
  assert.match(permissions, /contents: read/);
  assert.doesNotMatch(permissions, /contents: write/);
  assert.doesNotMatch(permissions, /packages: write/);
});

test('is pinned to main, the production environment and the release lock', async () => {
  const source = await workflow();

  assert.match(source, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /environment: production/);
  assert.match(source, /group: crm-production-deploy/);
  assert.match(source, /cancel-in-progress: false/);
});

test('demands an exact confirmation and deployed-SHA lineage', async () => {
  const source = await workflow();

  assert.match(source, /INSPECT_CRM_ACTIVITY_TYPES/);
  assert.match(source, /\[\[ "\$\{DEPLOYED_SHA\}" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(source, /git merge-base --is-ancestor/);
  assert.match(source, /crm-workspace-metadata-bootstrap\.yml/);
});

test('always revokes the short-lived key and clears local credentials', async () => {
  const source = await workflow();
  const revoke = source.indexOf('Revoke the short-lived diagnostic API key');
  const cleanup = source.indexOf('Remove local authentication artifacts');

  assert.ok(revoke > 0 && cleanup > revoke);
  assert.match(
    source.slice(revoke, revoke + 200),
    /if: always\(\)/,
  );
  assert.match(source.slice(cleanup), /if: always\(\)/);
  assert.match(source, /CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke/);
});
