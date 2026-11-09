import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const repositoryRoot = join(__dirname, '..', '..', '..', '..');
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/corgi-thirteen-f-app-production.yml'),
  'utf8',
);
const verifier = readFileSync(
  join(__dirname, 'corgiThirteenFAppProduction.mjs'),
  'utf8',
);
const tenantVerifier = readFileSync(
  join(__dirname, 'corgiThirteenFDeploymentTenant.production.spec.ts'),
  'utf8',
);
const deploymentKey = readFileSync(
  join(
    repositoryRoot,
    'packages/twenty-apps/internal/corgi-crm/scripts/deployment-api-key.mjs',
  ),
  'utf8',
);

const position = (needle: string): number => {
  const index = workflow.indexOf(needle);

  expect(index, `workflow must contain ${needle}`).not.toBe(-1);

  return index;
};

test('pins the exact production tenant and immutable app identities', () => {
  expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain('group: crm-production-deploy');
  expect(workflow).toContain('Corgi ETF');
  expect(workflow).toContain('eabf5d9d-fc99-4acb-b160-710ecb1db996');

  for (const identifier of [
    '38ba5a6a-430e-455a-a27b-fba07af35944',
    '42f51bb6-3a42-43fd-8202-2f9196f0b03a',
    'e598657f-5627-4df7-9c73-51ac1a9ec40e',
    '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a',
    '74e11c1b-ed63-4d94-bf2a-89db86edcf39',
  ]) {
    expect(workflow).toContain(identifier);
    expect(verifier).toContain(identifier);
  }
});

test('uses the proven short-lived key flow and masks the token', () => {
  expect(
    workflow.match(/corgiCrmAppDeploymentKey\.production\.spec\.ts/g),
  ).toHaveLength(2);
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: acquire');
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke');
  expect(workflow).toContain('echo "::add-mask::${token}"');
  expect(workflow).not.toContain('TWENTY_API_KEY: ${{ secrets.');
  expect(tenantVerifier).toContain("'API_KEYS_AND_WEBHOOKS'");
  expect(tenantVerifier).toContain("'APPLICATIONS'");
  expect(tenantVerifier).toContain("'MARKETPLACE_APPS'");
  expect(tenantVerifier).toContain("'ROLES'");
  expect(deploymentKey).toContain(
    'const KEY_LIFETIME_MILLISECONDS = 30 * 60 * 1000;',
  );
});

test('prechecks, publishes, installs, verifies, and narrowly rolls back', () => {
  const precheck = position('Precheck the existing Corgi 13F installation');
  const publish = position('Publish the private Corgi 13F app');
  const install = position('Install or upgrade the Corgi 13F app');
  const verify = position(
    'Verify the installed application, object, view, navigation, and role',
  );
  const rollback = position(
    'Uninstall only a fresh installation after verification failure',
  );
  const revoke = position('Revoke the short-lived deployment API key');

  expect(precheck).toBeLessThan(publish);
  expect(publish).toBeLessThan(install);
  expect(install).toBeLessThan(verify);
  expect(verify).toBeLessThan(rollback);
  expect(rollback).toBeLessThan(revoke);
  expect(workflow).toMatch(
    /steps\.verify\.outcome == 'failure'.*steps\.precheck\.outputs\.fresh_install == 'true'.*steps\.install\.outcome == 'success'/,
  );
  expect(verifier).toContain('uninstallApplication');
});

test('always revokes the key and deletes local authentication artifacts', () => {
  expect(workflow).toMatch(
    /Revoke the short-lived deployment API key[\s\S]*if: \$\{\{ always\(\)/,
  );
  expect(workflow).toMatch(
    /Remove local authentication artifacts[\s\S]*if: always\(\)/,
  );
  expect(workflow).toContain('/home/runner/.twenty/config.json');
  expect(workflow).toContain('.auth/production-user.json');
});
