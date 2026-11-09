import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import { buildSchema, parse, validate } from 'graphql';

import { classifyDeploymentState } from './corgiThirteenFDeploymentState.mjs';

const repositoryRoot = join(__dirname, '..', '..', '..', '..');
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/corgi-thirteen-f-app-production.yml'),
  'utf8',
);
const verifier = readFileSync(
  join(__dirname, 'corgiThirteenFAppProduction.mjs'),
  'utf8',
);
const deploymentState = readFileSync(
  join(__dirname, 'corgiThirteenFDeploymentState.mjs'),
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
const metadataSchema = readFileSync(
  join(
    repositoryRoot,
    'packages/twenty-client-sdk/src/metadata/generated/schema.graphql',
  ),
  'utf8',
);

const exactRegistration = {
  id: 'registration-1',
  universalIdentifier: '38ba5a6a-430e-455a-a27b-fba07af35944',
  ownerWorkspaceId: 'eabf5d9d-fc99-4acb-b160-710ecb1db996',
  name: 'Corgi 13F Library',
  sourceType: 'TARBALL',
  latestAvailableVersion: '0.2.0',
  isListed: false,
};
const exactInstallation = {
  id: 'application-1',
  universalIdentifier: '38ba5a6a-430e-455a-a27b-fba07af35944',
  applicationRegistrationId: exactRegistration.id,
  version: '0.2.0',
  state: 'INSTALLED',
};
const previousRegistration = {
  ...exactRegistration,
  latestAvailableVersion: '0.1.0',
};
const previousInstallation = {
  ...exactInstallation,
  applicationRegistrationId: previousRegistration.id,
  version: '0.1.0',
};

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
    expect(`${verifier}\n${deploymentState}`).toContain(identifier);
  }
});

test('uses the proven short-lived key flow and masks the token', () => {
  expect(
    workflow.match(/corgiCrmAppDeploymentKey\.production\.spec\.ts/g),
  ).toHaveLength(2);
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: acquire');
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke');
  expect(workflow).toContain("CORGI_CRM_DEPLOYMENT_REQUIRE_EXACT_ROLE: 'true'");
  expect(workflow).toContain('echo "::add-mask::${token}"');
  expect(workflow).not.toContain('TWENTY_API_KEY: ${{ secrets.');
  expect(tenantVerifier).toContain("'API_KEYS_AND_WEBHOOKS'");
  expect(tenantVerifier).toContain("'APPLICATIONS'");
  expect(tenantVerifier).toContain("'MARKETPLACE_APPS'");
  expect(tenantVerifier).toContain("'ROLES'");
  expect(deploymentKey).toContain(
    'const KEY_LIFETIME_MILLISECONDS = 30 * 60 * 1000;',
  );
  expect(deploymentKey).toContain('VerifyExactCorgiCrmDeploymentRole');
  expect(deploymentKey).toContain('found.objectPermissions');
  expect(deploymentKey).toContain('found.fieldPermissions');
  expect(deploymentKey).toContain('found.rowLevelPermissionPredicates');
  expect(deploymentKey).toContain('found.rowLevelPermissionPredicateGroups');
});

test('first run publishes once and installs the exact registration', () => {
  expect(
    classifyDeploymentState({ applications: [], registration: null }),
  ).toEqual({
    mode: 'absent',
    publish: true,
    install: true,
    upgrade: false,
    freshInstall: true,
    registrationPreexisting: false,
  });
  expect(workflow).toContain("if: steps.precheck.outputs.publish == 'true'");
  expect(workflow).toContain("if: steps.precheck.outputs.install == 'true'");
  expect(workflow).toContain('assert-installable');
});

test('rerun after success verifies without republishing or reinstalling', () => {
  expect(
    classifyDeploymentState({
      applications: [exactInstallation],
      registration: exactRegistration,
    }),
  ).toEqual({
    mode: 'installed',
    publish: false,
    install: false,
    upgrade: false,
    freshInstall: false,
    registrationPreexisting: true,
  });
});

test('rerun after failed-install rollback reuses the retained registration', () => {
  expect(
    classifyDeploymentState({
      applications: [],
      registration: exactRegistration,
    }),
  ).toEqual({
    mode: 'registered',
    publish: false,
    install: true,
    upgrade: false,
    freshInstall: true,
    registrationPreexisting: true,
  });
  expect(verifier).toContain('exact registration retained for safe retry');
  expect(verifier).not.toContain('deleteApplicationRegistration');
});

test('publishes and upgrades the exact previous production release in place', () => {
  expect(
    classifyDeploymentState({
      applications: [previousInstallation],
      registration: previousRegistration,
    }),
  ).toEqual({
    mode: 'upgrade-required',
    publish: true,
    install: false,
    upgrade: true,
    freshInstall: false,
    registrationPreexisting: true,
  });

  expect(
    classifyDeploymentState({
      applications: [previousInstallation],
      registration: exactRegistration,
    }),
  ).toEqual({
    mode: 'upgrade-required',
    publish: false,
    install: false,
    upgrade: true,
    freshInstall: false,
    registrationPreexisting: true,
  });
  expect(workflow).toContain("if: steps.precheck.outputs.upgrade == 'true'");
  expect(verifier).toContain('upgradeApplication');
  expect(verifier).toContain('targetVersion: VERSION');
});

test('fails closed on registration or installed-release conflicts', () => {
  expect(() =>
    classifyDeploymentState({
      applications: [],
      registration: {
        ...exactRegistration,
        latestAvailableVersion: '0.3.0',
      },
    }),
  ).toThrow(/conflicts with the release/);
  expect(() =>
    classifyDeploymentState({
      applications: [],
      registration: {
        ...exactRegistration,
        ownerWorkspaceId: '11111111-1111-4111-8111-111111111111',
      },
    }),
  ).toThrow(/conflicts with the release/);
  expect(() =>
    classifyDeploymentState({
      applications: [{ ...exactInstallation, state: 'INSTALLING' }],
      registration: exactRegistration,
    }),
  ).toThrow(/not an approved stable release/);
});

test('uses metadata operations supported by the pinned Twenty schema', () => {
  const documents = [...verifier.matchAll(/query: `([\s\S]*?)`,/g)].map(
    ([, document]) => document,
  );

  expect(documents).toHaveLength(5);
  const schema = buildSchema(metadataSchema);

  for (const document of documents) {
    expect(
      validate(schema, parse(document)).map(({ message }) => message),
    ).toEqual([]);
  }
});

test('verifies the resumable import identity fields in live metadata', () => {
  expect(verifier).toContain('0540519f-2f64-4429-a72a-9f77e9923f2a');
  expect(verifier).toContain('0f8f0907-75e2-455c-af5c-409e5f11ff46');
  expect(verifier).toContain("importPendingFileIdField.type !== 'TEXT'");
  expect(verifier).toContain('importPendingFileIdField.isNullable !== true');
  expect(verifier).toContain("sourceNodeIdField.type !== 'TEXT'");
  expect(verifier).toContain('sourceNodeIdField.isNullable !== true');
  expect(verifier).toContain('sourceNodeIdField.isUnique !== true');
  expect(verifier).toContain(
    'universalIdentifier name type isActive isNullable isUnique',
  );
});

test('never rolls back a concurrent SAME_VERSION publish or install race', () => {
  const rollbackCondition = workflow.match(
    /Roll back only this run's fresh installation and retain registration\n\s+if: ([^\n]+)/,
  )?.[1];

  expect(rollbackCondition).toContain("steps.install.outcome == 'success'");
  expect(rollbackCondition).toContain("steps.verify.outcome == 'failure'");
  expect(rollbackCondition).not.toContain("steps.install.outcome == 'failure'");
  expect(rollbackCondition).not.toContain("steps.publish.outcome == 'failure'");
  expect(workflow).toContain('assert-installable');
});

test('never uninstalls after an ambiguous or lost install response', () => {
  const rollbackCondition = workflow.match(
    /Roll back only this run's fresh installation and retain registration\n\s+if: ([^\n]+)/,
  )?.[1];

  expect(rollbackCondition).toContain(
    "steps.precheck.outputs.fresh_install == 'true'",
  );
  expect(rollbackCondition).toContain("steps.install.outcome == 'success'");
  expect(rollbackCondition).toContain("steps.verify.outcome == 'failure'");
  expect(rollbackCondition).not.toContain("outcome != 'skipped'");
});

test('prechecks, conditionally publishes, installs, verifies, and narrowly rolls back', () => {
  const precheck = position('Precheck the existing Corgi 13F installation');
  const publish = position('Publish the private Corgi 13F app');
  const install = position('Install the exact registered Corgi 13F release');
  const upgrade = position(
    'Upgrade the existing Corgi 13F installation in place',
  );
  const verify = position(
    'Verify the installed application, objects, views, navigation, and role',
  );
  const rollback = position(
    "Roll back only this run's fresh installation and retain registration",
  );
  const revoke = position('Revoke the short-lived deployment API key');

  expect(precheck).toBeLessThan(publish);
  expect(publish).toBeLessThan(install);
  expect(install).toBeLessThan(upgrade);
  expect(upgrade).toBeLessThan(verify);
  expect(verify).toBeLessThan(rollback);
  expect(rollback).toBeLessThan(revoke);
  expect(workflow).toMatch(
    /steps\.precheck\.outputs\.fresh_install == 'true'.*steps\.install\.outcome == 'success'.*steps\.verify\.outcome == 'failure'/,
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
