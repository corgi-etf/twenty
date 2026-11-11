import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';
import { buildSchema, parse, validate } from 'graphql';

import {
  VERSION as DEPLOYMENT_VERSION,
  classifyDeploymentState,
} from './corgiThirteenFDeploymentState.mjs';

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
const userSessionUpgrade = readFileSync(
  join(__dirname, 'corgiThirteenFUserSessionUpgrade.production.spec.ts'),
  'utf8',
);
const userSessionUpgradeHelper = readFileSync(
  join(__dirname, 'corgiThirteenFUserSessionUpgrade.mjs'),
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
const verifierModuleUrl = pathToFileURL(
  join(__dirname, 'corgiThirteenFAppProduction.mjs'),
).href;

const evaluateApplicationVariableHelper = (expression: string): unknown => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const verifier = await import(${JSON.stringify(verifierModuleUrl)}); process.stdout.write(JSON.stringify(${expression}));`,
    ],
    { encoding: 'utf8' },
  );

  expect(result.status, 'isolated verifier helper evaluation failed').toBe(0);

  return JSON.parse(result.stdout);
};

const APP_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const RELEASE_VERSION = '0.3.1';
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
const SOURCE_ONLY_VARIABLE_IDS: readonly string[] = [
  '7c8630fc-233a-42e2-a19b-bd750a597435',
  'fefc317b-7aa5-4e6a-8ad7-046dd0dd04b5',
  '90e85886-1020-4404-a75a-01b76f9207f0',
];
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
  latestAvailableVersion: DEPLOYMENT_VERSION,
  isListed: false,
};
const exactInstallation = {
  id: 'application-1',
  universalIdentifier: APP_ID,
  applicationRegistrationId: exactRegistration.id,
  version: DEPLOYMENT_VERSION,
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
const publishedInstallation = {
  ...exactInstallation,
  version: PUBLISHED_VERSION,
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
  expect(workflow).toContain(`CORGI_THIRTEEN_F_VERSION: ${RELEASE_VERSION}`);

  for (const identifier of EXPECTED_IDS) {
    expect(workflow).toContain(identifier);
    if (!SOURCE_ONLY_VARIABLE_IDS.includes(identifier)) {
      expect(`${verifier}\n${deploymentState}`).toContain(identifier);
    }
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
  expect(
    classifyDeploymentState({
      applications: [publishedInstallation],
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
  expect(
    classifyDeploymentState({
      applications: [publishedInstallation],
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
  expect(verifier).not.toContain('upgradeApplication');
});

test('uses the proven user session only for the guarded in-place upgrade', () => {
  const upgrade = position(
    'Upgrade the existing Corgi 13F installation in place',
  );
  const configure = position('Configure the Corgi 13F application variables');
  const upgradeStep = workflow.slice(upgrade, configure);

  expect(upgradeStep).toContain(
    'corgiThirteenFUserSessionUpgrade.production.spec.ts',
  );
  expect(upgradeStep).toContain('CORGI_THIRTEEN_F_USER_SESSION_UPGRADE');
  expect(upgradeStep).toContain('CORGI_CRM_EXPECTED_USER_WORKSPACE_ID');
  expect(upgradeStep).toContain('CRM_E2E_LOGIN');
  expect(upgradeStep).toContain('CRM_E2E_PASSWORD');
  expect(upgradeStep).not.toContain('CORGI_CRM_API_KEY');
  expect(userSessionUpgrade).toContain('page.request.post');
  expect(userSessionUpgrade).toContain(
    'currentUserWorkspace { id permissionFlags isImpersonating }',
  );
  expect(userSessionUpgrade).toContain('upgradeApplication');
  expect(userSessionUpgrade).not.toContain('CORGI_CRM_API_KEY');
  expect(userSessionUpgrade).not.toContain('Authorization');
  expect(userSessionUpgradeHelper).toContain('maxAttempts = 12');
  expect(userSessionUpgradeHelper).toContain(
    'membership.permissionFlags.includes(REQUIRED_PERMISSION)',
  );
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
      applications: [],
      registration: { ...exactRegistration, latestAvailableVersion: '9.9.9' },
    }),
  ).toThrow(/conflicts with the release/);
});

test('accepts only the exact failed v0.3.0 recovery pair', () => {
  const invalidRegistrationVersions = ['0.1.0', '0.2.0', PREVIOUS_VERSION];

  for (const latestAvailableVersion of invalidRegistrationVersions) {
    expect(() =>
      classifyDeploymentState({
        applications: [publishedInstallation],
        registration: {
          ...exactRegistration,
          latestAvailableVersion,
        },
      }),
    ).toThrow(/not an approved stable release/);
  }

  const invalidStates = [
    {
      applications: [publishedInstallation],
      registration: null,
    },
    {
      applications: [
        {
          ...publishedInstallation,
          applicationRegistrationId: 'other-registration',
        },
      ],
      registration: publishedRegistration,
    },
    {
      applications: [{ ...publishedInstallation, state: 'INSTALLING' }],
      registration: publishedRegistration,
    },
    {
      applications: [{ ...publishedInstallation, version: '9.9.9' }],
      registration: publishedRegistration,
    },
    {
      applications: [publishedInstallation, { ...publishedInstallation }],
      registration: publishedRegistration,
    },
  ];

  for (const state of invalidStates) {
    expect(() => classifyDeploymentState(state)).toThrow();
  }

  const invalidRegistrations = [
    { ...publishedRegistration, ownerWorkspaceId: 'other-workspace' },
    { ...publishedRegistration, sourceType: 'MARKETPLACE' },
    { ...publishedRegistration, isListed: true },
    { ...publishedRegistration, name: 'Other app' },
  ];

  for (const registration of invalidRegistrations) {
    expect(() =>
      classifyDeploymentState({
        applications: [publishedInstallation],
        registration,
      }),
    ).toThrow(/conflicts with the release/);
  }
});

test('verifies the v0.3.1 runtime without exporting the private TARBALL app', () => {
  expect(verifier).not.toContain('exportApplication');
  expect(verifier).not.toContain('assertManifest');
  expect(verifier).not.toContain('metadata.exportApplication');
  expect(verifier).toContain('application.version !== VERSION');
  expect(verifier).toContain("application.state !== 'INSTALLED'");
  expect(verifier).toContain('application.objects.length !== 0');
  expect(verifier).toContain('applicationFields.length !== 1');
  expect(verifier).toContain("field.name !== 'thirteenFFirmId'");
  expect(verifier).toContain("field.type !== 'TEXT'");
  expect(verifier).toContain('field.isNullable !== true');
  expect(verifier).toContain('field.isUIEditable !== false');
  expect(verifier).toContain('application.frontComponents.length !== 2');
  expect(verifier).toContain(
    "workspaceFrontComponent.name !== '13F workspace'",
  );
  expect(verifier).toContain(
    "companyFrontComponent.name !== 'Company 13F holdings'",
  );
  expect(verifier).toContain('application.commandMenuItems.length !== 1');
  expect(verifier).toContain("command.label !== 'View 13F holdings'");
  expect(verifier).toContain('application.logicFunctions.length !== 1');
  expect(verifier).toContain("logicFunction.name !== 'thirteen-f-query'");
  expect(verifier).toContain('application.applicationVariables.length');
  expect(verifier).toContain('applicationPageLayouts.length !== 1');
  expect(verifier).toContain("navigation.type !== 'PAGE_LAYOUT'");
  expect(verifier).toContain("pageLayout.type !== 'STANDALONE_PAGE'");
  expect(verifier).toContain("pageTab.title !== '13F'");
  expect(verifier).toContain("pageWidget.title !== '13F'");
  expect(verifier).toContain('conditionalAvailabilityExpression');
  expect(verifier).toContain('someDefined(selectedRecords');
  expect(verifier).toContain(
    "httpRouteTriggerSettings.path !== '/thirteen-f/query'",
  );
  expect(verifier).toContain('application.defaultRoleId !== role.id');
  expect(verifier).toContain("role.label !== 'Corgi 13F server role'");
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
  expect(verifier).not.toContain('variable.value !== expectedValue');
  expect(verifier).toContain('SECRET_APPLICATION_VARIABLE_MASK');
  expect(verifier).toContain('expectedApplicationVariableDisplayValue');
  expect(verifier).not.toMatch(/console\.log\([^)]*API_READ_TOKEN/);
  expect(workflow).not.toMatch(
    /GITHUB_OUTPUT[^\n]*CORGI_THIRTEEN_F_API_READ_TOKEN/,
  );
});

test('derives the documented masked display without accepting raw secret text', () => {
  const secretCases = [
    ['', ''],
    ['123456789', '********'],
    ['0123456789012345678901234567890123456789', '0123********'],
    [`abcde${'x'.repeat(95)}`, 'abcde********'],
  ];

  for (const [secret, expectedDisplayValue] of secretCases) {
    expect(
      evaluateApplicationVariableHelper(
        `verifier.expectedApplicationVariableDisplayValue(${JSON.stringify(secret)}, true)`,
      ),
    ).toBe(expectedDisplayValue);
  }

  const rawSecret = '0123456789012345678901234567890123456789';
  const maskedSecret = '0123********';

  expect(
    evaluateApplicationVariableHelper(
      `verifier.applicationVariableMatches(${JSON.stringify({ value: maskedSecret, isSecret: true })}, ${JSON.stringify(rawSecret)}, true)`,
    ),
  ).toBe(true);
  expect(
    evaluateApplicationVariableHelper(
      `verifier.applicationVariableMatches(${JSON.stringify({ value: rawSecret, isSecret: true })}, ${JSON.stringify(rawSecret)}, true)`,
    ),
  ).toBe(false);
  expect(
    evaluateApplicationVariableHelper(
      `verifier.applicationVariableMatches(${JSON.stringify({ value: maskedSecret, isSecret: false })}, ${JSON.stringify(rawSecret)}, true)`,
    ),
  ).toBe(false);
});

test('keeps non-secret application-variable verification exact', () => {
  const expectedValue = 'https://admin.corgiinvest.com';

  expect(
    evaluateApplicationVariableHelper(
      `verifier.applicationVariableMatches(${JSON.stringify({ value: expectedValue, isSecret: false })}, ${JSON.stringify(expectedValue)}, false)`,
    ),
  ).toBe(true);
  expect(
    evaluateApplicationVariableHelper(
      `verifier.applicationVariableMatches(${JSON.stringify({ value: `${expectedValue}/other`, isSecret: false })}, ${JSON.stringify(expectedValue)}, false)`,
    ),
  ).toBe(false);
});

test('uses only metadata operations supported by the pinned Twenty schema', () => {
  const documents = [verifier, userSessionUpgrade].flatMap((source) =>
    [...source.matchAll(/query: `([\s\S]*?)`,/g)].map(
      ([, document]) => document,
    ),
  );
  expect(documents).toHaveLength(7);
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
