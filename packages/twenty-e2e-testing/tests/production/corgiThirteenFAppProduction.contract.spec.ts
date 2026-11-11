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

const APP_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const VERSION = '0.3.1';
const PUBLISHED_VERSION = '0.3.0';
const PREVIOUS_VERSION = '0.2.1';
const EXPECTED_IDS = [
  APP_ID,
  '6404c75f-c713-4db1-965d-6cf54178a18f',
  '2850638f-f58f-4af9-8d06-1e832a14dd33',
  '4ec5c18e-95ad-4848-8084-d2d41bd21ffc',
  '9c000341-d6f3-48b8-9731-73c5c295eba3',
  '3e78cf66-c454-4c70-8ccc-d095eb5b0c20',
  '55a697bc-c488-4471-93f5-ece5f58d37bb',
  'ee91c40f-759d-42bd-be49-43f0af07982b',
  'e202fe49-1d7f-4bb9-9bce-77f15a2322c0',
  'a418e514-347d-4f63-a0bb-109bedddfdb1',
  '7c8630fc-233a-42e2-a19b-bd750a597435',
  'fefc317b-7aa5-4e6a-8ad7-046dd0dd04b5',
  '90e85886-1020-4404-a75a-01b76f9207f0',
  '74e11c1b-ed63-4d94-bf2a-89db86edcf39',
] as const;
const OBSOLETE_IDS = [
  '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a',
  '42f51bb6-3a42-43fd-8202-2f9196f0b03a',
  'e598657f-5627-4df7-9c73-51ac1a9ec40e',
  'a6c6ba92-47a2-4aaf-b10a-0d13eff6198e',
  '60254ecf-ab3e-4028-8edd-f489a9db58e7',
  '49947326-15af-430d-9c6d-b4d4fc291fce',
  '1fbb403a-ecd3-402b-aeb5-2ce9fd14d2dd',
  '46a395eb-105d-4dce-8358-99de47279e4c',
  '6b32ede9-3ff1-468b-a87d-56e1c6372917',
  '9c6ceb0f-0c49-4f52-86f0-0762c7aca7ff',
  'b4bc99c9-eacc-490d-baa2-d26f94131a41',
  'f640c94c-2c8b-4fe3-9043-11385d2367e2',
  '6fcd2cba-af82-42ae-8ed3-975a3ff98b87',
  'dbe6e047-4366-4e31-be1d-cf88b27e650f',
  '08f8b6ac-7942-484a-b4c8-2124e2a88186',
  '5ddcd92f-eece-43fc-8395-355402c4dea3',
] as const;

const exactRegistration = {
  id: 'registration-1',
  universalIdentifier: APP_ID,
  ownerWorkspaceId: WORKSPACE_ID,
  name: 'Corgi 13F',
  sourceType: 'TARBALL',
  latestAvailableVersion: VERSION,
  isListed: false,
};
const exactInstallation = {
  id: 'application-1',
  universalIdentifier: APP_ID,
  applicationRegistrationId: exactRegistration.id,
  version: VERSION,
  state: 'INSTALLED',
};
const previousRegistration = {
  ...exactRegistration,
  latestAvailableVersion: PREVIOUS_VERSION,
};
const publishedRegistration = {
  ...exactRegistration,
  latestAvailableVersion: PUBLISHED_VERSION,
};
const previousInstallation = {
  ...exactInstallation,
  version: PREVIOUS_VERSION,
};

const position = (needle: string): number => {
  const index = workflow.indexOf(needle);
  expect(index, `workflow must contain ${needle}`).not.toBe(-1);
  return index;
};

test('pins the exact v0.3.1 production tenant and native workspace identities', () => {
  expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain('group: crm-production-deploy');
  expect(workflow).toContain('Corgi ETF');
  expect(workflow).toContain(WORKSPACE_ID);
  expect(workflow).toContain(`CORGI_THIRTEEN_F_VERSION: ${VERSION}`);

  for (const identifier of EXPECTED_IDS) {
    expect(workflow).toContain(identifier);
    expect(`${verifier}\n${deploymentState}`).toContain(identifier);
  }
  for (const identifier of OBSOLETE_IDS) {
    expect(workflow).not.toContain(identifier);
    expect(verifier).not.toContain(identifier);
  }
  expect(workflow).toContain('normalized_migration_confirmation');
  expect(workflow).toContain('NORMALIZED_THIRTEEN_F_MIGRATION_COMPLETE');
});

test('uses the proven short-lived deploy key and release identity guards', () => {
  expect(
    workflow.match(/corgiCrmAppDeploymentKey\.production\.spec\.ts/g),
  ).toHaveLength(2);
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: acquire');
  expect(workflow).toContain('CORGI_CRM_DEPLOYMENT_KEY_OPERATION: revoke');
  expect(workflow).toContain("CORGI_CRM_DEPLOYMENT_REQUIRE_EXACT_ROLE: 'true'");
  expect(workflow).toContain('echo "::add-mask::${token}"');
  expect(workflow).toContain('[[ "${RELEASE_SHA}" == "${GITHUB_SHA}" ]]');
  expect(workflow).not.toContain('TWENTY_API_KEY: ${{ secrets.');
  expect(tenantVerifier).toContain("'API_KEYS_AND_WEBHOOKS'");
  expect(tenantVerifier).toContain("'APPLICATIONS'");
  expect(tenantVerifier).toContain("'MARKETPLACE_APPS'");
  expect(tenantVerifier).toContain("'ROLES'");
  expect(deploymentKey).toContain(
    'const KEY_LIFETIME_MILLISECONDS = 30 * 60 * 1000;',
  );
  expect(deploymentKey).toContain('VerifyExactCorgiCrmDeploymentRole');
});

test('classifies first install, rerun, and published-version upgrades safely', () => {
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
  expect(
    classifyDeploymentState({
      applications: [previousInstallation],
      registration: publishedRegistration,
    }),
  ).toEqual({
    mode: 'upgrade-required',
    publish: true,
    install: false,
    upgrade: true,
    freshInstall: false,
    registrationPreexisting: true,
  });
  expect(verifier).toContain('upgradeApplication');
  expect(verifier).toContain('targetVersion: VERSION');
});

test('retains exact registration after a failed fresh install verification', () => {
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

test('fails closed on registration and installed-release conflicts', () => {
  expect(() =>
    classifyDeploymentState({
      applications: [],
      registration: {
        ...exactRegistration,
        name: 'Corgi 13F Library',
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
  expect(() =>
    classifyDeploymentState({
      applications: [{ ...exactInstallation, version: PUBLISHED_VERSION }],
      registration: publishedRegistration,
    }),
  ).toThrow(/not an approved stable release/);
  expect(() =>
    classifyDeploymentState({
      applications: [],
      registration: { ...exactRegistration, latestAvailableVersion: '9.9.9' },
    }),
  ).toThrow(/conflicts with the release/);
});

test('verifies only the v0.3.1 native manifest and zero app-owned objects', () => {
  expect(verifier).toContain('application.objects.length !== 0');
  expect(verifier).toContain('manifest.objects.length !== 0');
  expect(verifier).toContain('manifest.views.length !== 0');
  expect(verifier).toContain("field.name !== 'thirteenFFirmId'");
  expect(verifier).toContain("field.type !== 'TEXT'");
  expect(verifier).toContain('field.isNullable !== true');
  expect(verifier).toContain('field.isUIEditable !== false');
  expect(verifier).toContain("navigation.type !== 'PAGE_LAYOUT'");
  expect(verifier).toContain("pageLayout.type !== 'STANDALONE_PAGE'");
  expect(verifier).toContain('conditionalAvailabilityExpression');
  expect(verifier).toContain('someDefined(selectedRecords');
  expect(verifier).toContain(
    "httpRouteTriggerSettings.path !== '/thirteen-f/query'",
  );
  expect(verifier).toContain('role.objectPermissions.length !== 0');
  expect(verifier).toContain('role.permissionFlags.length !== 0');
  expect(verifier).not.toContain('UPLOAD_FILE');
});

test('configures and verifies all application variables without exposing the secret', () => {
  expect(workflow).toContain(
    'CORGI_THIRTEEN_F_API_READ_TOKEN: ${{ secrets.CORGI_THIRTEEN_F_API_READ_TOKEN }}',
  );
  expect(workflow).toContain('::add-mask::');
  expect(workflow).toContain('configure');
  expect(verifier).toContain('updateOneApplicationVariable');
  expect(verifier).toContain('CORGI_THIRTEEN_F_API_BASE_URL');
  expect(verifier).toContain('https://admin.corgiinvest.com');
  expect(verifier).toContain('CORGI_THIRTEEN_F_WORKSPACE_ID');
  expect(verifier).toContain(WORKSPACE_ID);
  expect(verifier).toContain('CORGI_THIRTEEN_F_API_READ_TOKEN');
  expect(verifier).toContain('variable.value !== expectedValue');
  expect(verifier).not.toMatch(/console\.log\([^)]*API_READ_TOKEN/);
  expect(workflow).not.toMatch(
    /GITHUB_OUTPUT[^\n]*CORGI_THIRTEEN_F_API_READ_TOKEN/,
  );
});

test('uses only metadata operations supported by the pinned Twenty schema', () => {
  const documents = [...verifier.matchAll(/query: `([\s\S]*?)`,/g)].map(
    ([, document]) => document,
  );
  expect(documents).toHaveLength(6);
  const schema = buildSchema(metadataSchema);
  for (const document of documents) {
    expect(
      validate(schema, parse(document)).map(({ message }) => message),
    ).toEqual([]);
  }
});

test('configures after install or upgrade and before final verification', () => {
  const precheck = position('Precheck the existing Corgi 13F installation');
  const publish = position('Publish the private Corgi 13F app');
  const install = position('Install the exact registered Corgi 13F release');
  const upgrade = position(
    'Upgrade the existing Corgi 13F installation in place',
  );
  const configure = position('Configure the Corgi 13F application variables');
  const verify = position('Verify the installed Corgi 13F native workspace');
  const rollback = position(
    "Roll back only this run's fresh installation and retain registration",
  );
  const revoke = position('Revoke the short-lived deployment API key');

  expect(precheck).toBeLessThan(publish);
  expect(publish).toBeLessThan(install);
  expect(install).toBeLessThan(upgrade);
  expect(upgrade).toBeLessThan(configure);
  expect(configure).toBeLessThan(verify);
  expect(verify).toBeLessThan(rollback);
  expect(rollback).toBeLessThan(revoke);
});

test('rolls back only a confirmed fresh install after configure or verify failure', () => {
  const rollbackCondition = workflow.match(
    /Roll back only this run's fresh installation and retain registration\n\s+if: ([^\n]+)/,
  )?.[1];

  expect(rollbackCondition).toContain(
    "steps.precheck.outputs.fresh_install == 'true'",
  );
  expect(rollbackCondition).toContain("steps.install.outcome == 'success'");
  expect(rollbackCondition).toContain("steps.configure.outcome == 'failure'");
  expect(rollbackCondition).toContain("steps.verify.outcome == 'failure'");
  expect(rollbackCondition).not.toContain("steps.install.outcome == 'failure'");
  expect(rollbackCondition).not.toContain("steps.publish.outcome == 'failure'");
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
