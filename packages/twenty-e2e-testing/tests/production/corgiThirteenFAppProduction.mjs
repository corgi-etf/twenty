import { appendFile, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  APPLICATION_ID,
  VERSION,
  WORKSPACE_ID,
  classifyDeploymentState,
} from './corgiThirteenFDeploymentState.mjs';

const API_URL = 'https://crm.corgiinvest.com';
const WORKSPACE_NAME = 'Corgi ETF';
const API_BASE_URL = 'https://admin.corgiinvest.com';
const CONFIGURED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const COMPANY_OBJECT_ID = '20202020-b374-4779-a561-80086cb2e17f';
const COMPANY_FIELD_ID = '3e78cf66-c454-4c70-8ccc-d095eb5b0c20';
const PAGE_LAYOUT_ID = '6404c75f-c713-4db1-965d-6cf54178a18f';
const PAGE_TAB_ID = '2850638f-f58f-4af9-8d06-1e832a14dd33';
const PAGE_WIDGET_ID = '4ec5c18e-95ad-4848-8084-d2d41bd21ffc';
const NAVIGATION_ID = '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a';
const COMPANY_COMMAND_ID = '55a697bc-c488-4471-93f5-ece5f58d37bb';
const WORKSPACE_FRONT_COMPONENT_ID = 'ee91c40f-759d-42bd-be49-43f0af07982b';
const COMPANY_FRONT_COMPONENT_ID = 'e202fe49-1d7f-4bb9-9bce-77f15a2322c0';
const QUERY_LOGIC_FUNCTION_ID = 'a418e514-347d-4f63-a0bb-109bedddfdb1';
const ROLE_ID = '74e11c1b-ed63-4d94-bf2a-89db86edcf39';
const API_BASE_URL_VARIABLE_ID = '7c8630fc-233a-42e2-a19b-bd750a597435';
const API_READ_TOKEN_VARIABLE_ID = 'fefc317b-7aa5-4e6a-8ad7-046dd0dd04b5';
const WORKSPACE_ID_VARIABLE_ID = '90e85886-1020-4404-a75a-01b76f9207f0';

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const exactlyOne = (values, predicate, label) => {
  const matches = Array.isArray(values) ? values.filter(predicate) : [];

  if (matches.length !== 1) {
    throw new Error(`Expected one ${label}, found ${matches.length}`);
  }

  return matches[0];
};

const graphql = async ({ operationName, query, variables = {} }) => {
  const response = await fetch(`${API_URL}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnvironment('CORGI_CRM_API_KEY')}`,
      'Content-Type': 'application/json',
      Origin: API_URL,
    },
    body: JSON.stringify({ operationName, query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  }

  const body = await response.json();

  if (!body?.data || (Array.isArray(body.errors) && body.errors.length > 0)) {
    throw new Error(`${operationName} returned GraphQL errors or no data`);
  }

  return body.data;
};

const assertTenant = (workspace) => {
  if (
    CONFIGURED_WORKSPACE_ID !== WORKSPACE_ID ||
    workspace?.id !== WORKSPACE_ID ||
    workspace?.displayName !== WORKSPACE_NAME
  ) {
    throw new Error('Production workspace identity changed');
  }
};

const readDeploymentState = async () => {
  const data = await graphql({
    operationName: 'ReadCorgiThirteenFDeploymentState',
    query: `query ReadCorgiThirteenFDeploymentState($applicationId: String!) {
      currentWorkspace { id displayName }
      findApplicationRegistrationByUniversalIdentifier(
        universalIdentifier: $applicationId
      ) {
        id universalIdentifier name sourceType latestAvailableVersion
        ownerWorkspaceId isListed
      }
      findManyApplications {
        id universalIdentifier version state applicationRegistrationId
      }
    }`,
    variables: { applicationId: APPLICATION_ID },
  });

  assertTenant(data.currentWorkspace);

  return {
    applications: data.findManyApplications ?? [],
    registration: data.findApplicationRegistrationByUniversalIdentifier,
  };
};

const precheck = async () => {
  const state = classifyDeploymentState(await readDeploymentState());
  const outputPath = requiredEnvironment('CORGI_THIRTEEN_F_OUTPUT_PATH');

  await appendFile(
    outputPath,
    [
      `mode=${state.mode}`,
      `publish=${state.publish}`,
      `install=${state.install}`,
      `upgrade=${state.upgrade}`,
      `fresh_install=${state.freshInstall}`,
      `registration_preexisting=${state.registrationPreexisting}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await chmod(outputPath, 0o600);
  console.log(
    `Corgi 13F deployment state: ${state.mode}; publish=${state.publish}; install=${state.install}; upgrade=${state.upgrade}`,
  );
};

const assertInstallableRegistration = async () => {
  const state = classifyDeploymentState(await readDeploymentState());

  if (state.mode !== 'registered') {
    throw new Error(
      `Expected exact installable Corgi 13F registration, found ${state.mode}`,
    );
  }

  console.log(
    `Exact owned private Corgi 13F v${VERSION} registration is installable`,
  );
};

const upgrade = async () => {
  const before = classifyDeploymentState(await readDeploymentState());

  if (before.mode === 'installed') {
    console.log(`Corgi 13F v${VERSION} is already installed`);
    return;
  }
  if (before.mode !== 'upgrade-required' || before.publish) {
    throw new Error(
      `Corgi 13F cannot be upgraded from deployment state ${before.mode}`,
    );
  }

  let mutationError;
  try {
    const state = await readDeploymentState();
    const result = await graphql({
      operationName: 'UpgradeCorgiThirteenFApplication',
      query: `mutation UpgradeCorgiThirteenFApplication(
        $appRegistrationId: String!
        $targetVersion: String!
      ) {
        upgradeApplication(
          appRegistrationId: $appRegistrationId
          targetVersion: $targetVersion
        )
      }`,
      variables: {
        appRegistrationId: state.registration.id,
        targetVersion: VERSION,
      },
    });

    if (result.upgradeApplication !== true) {
      mutationError = new Error('Corgi 13F upgrade was not accepted');
    }
  } catch (error) {
    mutationError = error;
  }

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const state = classifyDeploymentState(await readDeploymentState());

    if (state.mode === 'installed') {
      console.log(`Corgi 13F was upgraded in place to v${VERSION}`);
      return;
    }
    if (state.mode !== 'upgrade-required') {
      throw new Error(
        `Corgi 13F entered unexpected state ${state.mode} during upgrade`,
      );
    }
    if (attempt < 12) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  throw mutationError ?? new Error('Corgi 13F upgrade did not converge');
};

const configure = async () => {
  const deployment = await readDeploymentState();
  const state = classifyDeploymentState(deployment);

  if (state.mode !== 'installed') {
    throw new Error(`Corgi 13F deployment is ${state.mode}, not installed`);
  }

  const application = exactlyOne(
    deployment.applications,
    ({ universalIdentifier }) => universalIdentifier === APPLICATION_ID,
    'installed Corgi 13F application',
  );
  const variables = new Map([
    ['CORGI_THIRTEEN_F_API_BASE_URL', API_BASE_URL],
    ['CORGI_THIRTEEN_F_WORKSPACE_ID', CONFIGURED_WORKSPACE_ID],
    [
      'CORGI_THIRTEEN_F_API_READ_TOKEN',
      requiredEnvironment('CORGI_THIRTEEN_F_API_READ_TOKEN'),
    ],
  ]);

  for (const [key, value] of variables) {
    const result = await graphql({
      operationName: 'ConfigureCorgiThirteenFApplicationVariable',
      query: `mutation ConfigureCorgiThirteenFApplicationVariable(
        $key: String!
        $value: String!
        $applicationId: UUID!
      ) {
        updateOneApplicationVariable(
          key: $key
          value: $value
          applicationId: $applicationId
        )
      }`,
      variables: { key, value, applicationId: application.id },
    });

    if (result.updateOneApplicationVariable !== true) {
      throw new Error('Corgi 13F application variable configuration failed');
    }
  }

  console.log('Corgi 13F application variables configured');
};

const assertManifest = (manifest) => {
  if (
    manifest?.application?.universalIdentifier !== APPLICATION_ID ||
    manifest.application.defaultRoleUniversalIdentifier !== ROLE_ID ||
    !Array.isArray(manifest.objects) ||
    manifest.objects.length !== 0 ||
    !Array.isArray(manifest.views) ||
    manifest.views.length !== 0 ||
    !Array.isArray(manifest.permissionFlags) ||
    manifest.permissionFlags.length !== 0
  ) {
    throw new Error('Corgi 13F exported application manifest is incorrect');
  }

  const field = exactlyOne(
    manifest.fields,
    ({ universalIdentifier }) => universalIdentifier === COMPANY_FIELD_ID,
    'exported Company 13F field',
  );
  if (
    manifest.fields.length !== 1 ||
    field.objectUniversalIdentifier !== COMPANY_OBJECT_ID ||
    field.name !== 'thirteenFFirmId' ||
    field.type !== 'TEXT' ||
    field.isNullable !== true ||
    field.isUnique !== true ||
    field.isUIEditable !== false
  ) {
    throw new Error('Corgi 13F exported Company field is incorrect');
  }

  const frontComponents = new Map(
    (manifest.frontComponents ?? []).map((item) => [
      item.universalIdentifier,
      item,
    ]),
  );
  if (
    frontComponents.size !== 2 ||
    !frontComponents.has(WORKSPACE_FRONT_COMPONENT_ID) ||
    !frontComponents.has(COMPANY_FRONT_COMPONENT_ID)
  ) {
    throw new Error('Corgi 13F exported front component set is incorrect');
  }

  const logicFunction = exactlyOne(
    manifest.logicFunctions,
    ({ universalIdentifier }) =>
      universalIdentifier === QUERY_LOGIC_FUNCTION_ID,
    'exported Corgi 13F query function',
  );
  const httpRouteTriggerSettings = logicFunction.httpRouteTriggerSettings;
  if (
    manifest.logicFunctions.length !== 1 ||
    !httpRouteTriggerSettings ||
    httpRouteTriggerSettings.path !== '/thirteen-f/query' ||
    httpRouteTriggerSettings.httpMethod !== 'POST' ||
    httpRouteTriggerSettings.isAuthRequired !== true
  ) {
    throw new Error('Corgi 13F exported logic function is incorrect');
  }

  const pageLayout = exactlyOne(
    manifest.pageLayouts,
    ({ universalIdentifier }) => universalIdentifier === PAGE_LAYOUT_ID,
    'exported 13F page layout',
  );
  const pageTab = exactlyOne(
    pageLayout.tabs,
    ({ universalIdentifier }) => universalIdentifier === PAGE_TAB_ID,
    'exported 13F page tab',
  );
  const pageWidget = exactlyOne(
    pageTab.widgets,
    ({ universalIdentifier }) => universalIdentifier === PAGE_WIDGET_ID,
    'exported 13F page widget',
  );
  if (
    manifest.pageLayouts.length !== 1 ||
    pageLayout.name !== '13F' ||
    pageLayout.type !== 'STANDALONE_PAGE' ||
    pageLayout.tabs.length !== 1 ||
    pageTab.title !== '13F' ||
    pageTab.widgets.length !== 1 ||
    pageWidget.type !== 'FRONT_COMPONENT' ||
    pageWidget.configuration?.configurationType !== 'FRONT_COMPONENT' ||
    pageWidget.configuration.frontComponentUniversalIdentifier !==
      WORKSPACE_FRONT_COMPONENT_ID
  ) {
    throw new Error('Corgi 13F exported page layout is incorrect');
  }

  const navigation = exactlyOne(
    manifest.navigationMenuItems,
    ({ universalIdentifier }) => universalIdentifier === NAVIGATION_ID,
    'exported 13F navigation item',
  );
  if (
    manifest.navigationMenuItems.length !== 1 ||
    navigation.name !== '13F' ||
    navigation.type !== 'PAGE_LAYOUT' ||
    navigation.pageLayoutUniversalIdentifier !== PAGE_LAYOUT_ID
  ) {
    throw new Error('Corgi 13F exported navigation is incorrect');
  }

  const command = exactlyOne(
    manifest.commandMenuItems,
    ({ universalIdentifier }) => universalIdentifier === COMPANY_COMMAND_ID,
    'exported Company 13F command',
  );
  const commandAvailability =
    command.conditionalAvailabilityExpression?.replace(/\s+/g, '') ?? '';
  if (
    manifest.commandMenuItems.length !== 1 ||
    command.label !== 'View 13F holdings' ||
    command.availabilityType !== 'GLOBAL_OBJECT_CONTEXT' ||
    command.availabilityObjectUniversalIdentifier !== COMPANY_OBJECT_ID ||
    command.frontComponentUniversalIdentifier !== COMPANY_FRONT_COMPONENT_ID ||
    !commandAvailability.includes('someDefined(selectedRecords') ||
    !commandAvailability.includes('thirteenFFirmId')
  ) {
    throw new Error('Corgi 13F exported Company command is incorrect');
  }

  const role = exactlyOne(
    manifest.roles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'exported Corgi 13F role',
  );
  if (
    manifest.roles.length !== 1 ||
    role.canReadAllObjectRecords !== false ||
    role.canUpdateAllObjectRecords !== false ||
    role.canSoftDeleteAllObjectRecords !== false ||
    role.canDestroyAllObjectRecords !== false ||
    role.canUpdateAllSettings !== false ||
    role.canBeAssignedToUsers !== false ||
    role.canBeAssignedToAgents !== false ||
    role.canBeAssignedToApiKeys !== false ||
    role.objectPermissions.length !== 0 ||
    role.permissionFlagUniversalIdentifiers.length !== 0
  ) {
    throw new Error('Corgi 13F exported role is incorrect');
  }

  const variableDefinitions = manifest.application.applicationVariables;
  const expectedVariableDefinitions = new Map([
    ['CORGI_THIRTEEN_F_API_BASE_URL', [API_BASE_URL_VARIABLE_ID, false]],
    ['CORGI_THIRTEEN_F_API_READ_TOKEN', [API_READ_TOKEN_VARIABLE_ID, true]],
    ['CORGI_THIRTEEN_F_WORKSPACE_ID', [WORKSPACE_ID_VARIABLE_ID, false]],
  ]);
  if (
    !variableDefinitions ||
    Object.keys(variableDefinitions).length !== expectedVariableDefinitions.size
  ) {
    throw new Error('Corgi 13F application variable manifest is incorrect');
  }
  for (const [
    key,
    [universalIdentifier, isSecret],
  ] of expectedVariableDefinitions) {
    const definition = variableDefinitions[key];
    if (
      definition?.universalIdentifier !== universalIdentifier ||
      definition.isSecret !== isSecret
    ) {
      throw new Error('Corgi 13F application variable manifest is incorrect');
    }
  }
};

const verifyOnce = async () => {
  const state = classifyDeploymentState(await readDeploymentState());

  if (state.mode !== 'installed') {
    throw new Error(`Corgi 13F deployment is ${state.mode}, not installed`);
  }

  const applicationData = await graphql({
    operationName: 'VerifyCorgiThirteenFApplication',
    query: `query VerifyCorgiThirteenFApplication($applicationId: UUID!) {
      currentWorkspace { id displayName }
      findOneApplication(universalIdentifier: $applicationId) {
        id universalIdentifier version state defaultRoleId
        objects { id universalIdentifier applicationId }
        frontComponents {
          id universalIdentifier name applicationId
        }
        commandMenuItems {
          id universalIdentifier label availabilityType
          availabilityObjectMetadataId conditionalAvailabilityExpression
          frontComponentId applicationId
        }
        logicFunctions {
          id universalIdentifier name applicationId httpRouteTriggerSettings
        }
        applicationVariables { key value isSecret }
      }
    }`,
    variables: { applicationId: APPLICATION_ID },
  });

  assertTenant(applicationData.currentWorkspace);
  const application = applicationData.findOneApplication;

  if (
    application?.universalIdentifier !== APPLICATION_ID ||
    application.version !== VERSION ||
    application.state !== 'INSTALLED'
  ) {
    throw new Error('Corgi 13F application release is not installed');
  }
  if (!Array.isArray(application.objects) || application.objects.length !== 0) {
    throw new Error('Corgi 13F application owns unexpected custom objects');
  }

  const workspaceFrontComponent = exactlyOne(
    application.frontComponents,
    ({ universalIdentifier }) =>
      universalIdentifier === WORKSPACE_FRONT_COMPONENT_ID,
    '13F workspace front component',
  );
  const companyFrontComponent = exactlyOne(
    application.frontComponents,
    ({ universalIdentifier }) =>
      universalIdentifier === COMPANY_FRONT_COMPONENT_ID,
    'Company 13F front component',
  );
  if (
    application.frontComponents.length !== 2 ||
    workspaceFrontComponent.applicationId !== application.id ||
    companyFrontComponent.applicationId !== application.id
  ) {
    throw new Error('Corgi 13F runtime front component set is incorrect');
  }

  const command = exactlyOne(
    application.commandMenuItems,
    ({ universalIdentifier }) => universalIdentifier === COMPANY_COMMAND_ID,
    'Company 13F command',
  );
  const commandAvailability =
    command.conditionalAvailabilityExpression?.replace(/\s+/g, '') ?? '';
  if (
    application.commandMenuItems.length !== 1 ||
    command.applicationId !== application.id ||
    command.label !== 'View 13F holdings' ||
    command.availabilityType !== 'GLOBAL_OBJECT_CONTEXT' ||
    command.frontComponentId !== companyFrontComponent.id ||
    !commandAvailability.includes('someDefined(selectedRecords') ||
    !commandAvailability.includes('thirteenFFirmId')
  ) {
    throw new Error('Corgi 13F runtime Company command is incorrect');
  }

  const logicFunction = exactlyOne(
    application.logicFunctions,
    ({ universalIdentifier }) =>
      universalIdentifier === QUERY_LOGIC_FUNCTION_ID,
    'Corgi 13F query function',
  );
  const httpRouteTriggerSettings = logicFunction.httpRouteTriggerSettings;
  if (
    application.logicFunctions.length !== 1 ||
    logicFunction.applicationId !== application.id ||
    !httpRouteTriggerSettings ||
    httpRouteTriggerSettings.path !== '/thirteen-f/query' ||
    httpRouteTriggerSettings.httpMethod !== 'POST' ||
    httpRouteTriggerSettings.isAuthRequired !== true
  ) {
    throw new Error('Corgi 13F runtime logic function is incorrect');
  }

  const expectedVariables = new Map([
    ['CORGI_THIRTEEN_F_API_BASE_URL', [API_BASE_URL, false]],
    [
      'CORGI_THIRTEEN_F_API_READ_TOKEN',
      [requiredEnvironment('CORGI_THIRTEEN_F_API_READ_TOKEN'), true],
    ],
    ['CORGI_THIRTEEN_F_WORKSPACE_ID', [CONFIGURED_WORKSPACE_ID, false]],
  ]);
  if (application.applicationVariables.length !== expectedVariables.size) {
    throw new Error('Corgi 13F application variable set is incorrect');
  }
  for (const [key, [expectedValue, isSecret]] of expectedVariables) {
    const variable = exactlyOne(
      application.applicationVariables,
      (candidate) => candidate.key === key,
      'configured Corgi 13F application variable',
    );
    if (variable.value !== expectedValue || variable.isSecret !== isSecret) {
      throw new Error(
        'Corgi 13F application variable configuration is incorrect',
      );
    }
  }

  const metadata = await graphql({
    operationName: 'VerifyCorgiThirteenFMetadata',
    query: `query VerifyCorgiThirteenFMetadata(
      $applicationId: UUID!
      $companyObjectId: UUID!
    ) {
      currentWorkspace { id displayName }
      exportApplication(universalIdentifier: $applicationId) {
        application { universalIdentifier }
        manifest
      }
      companyObjects: objects(
        paging: { first: 2 }
        filter: { universalIdentifier: { eq: $companyObjectId } }
      ) {
        edges {
          node {
            id universalIdentifier
            fieldsList {
              id universalIdentifier name type applicationId
              isActive isNullable isUnique isUIEditable
            }
          }
        }
      }
      getPageLayouts(pageLayoutType: STANDALONE_PAGE) {
        id universalIdentifier applicationId name type
        tabs {
          id universalIdentifier applicationId title
          widgets {
            id universalIdentifier applicationId title type
            configuration {
              __typename
              ... on FrontComponentConfiguration {
                configurationType frontComponentId
              }
            }
          }
        }
      }
      navigationMenuItems {
        id applicationId pageLayoutId type name
      }
      getRoles {
        id universalIdentifier
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canUpdateAllSettings canAccessAllTools
        canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
        permissionFlags { flag }
        objectPermissions { objectMetadataId }
        fieldPermissions { fieldMetadataId }
      }
    }`,
    variables: {
      applicationId: APPLICATION_ID,
      companyObjectId: COMPANY_OBJECT_ID,
    },
  });

  assertTenant(metadata.currentWorkspace);
  if (
    metadata.exportApplication?.application?.universalIdentifier !==
    APPLICATION_ID
  ) {
    throw new Error('Corgi 13F exported application identity is incorrect');
  }
  assertManifest(metadata.exportApplication.manifest);

  const companyObject = exactlyOne(
    metadata.companyObjects?.edges?.map(({ node }) => node),
    ({ universalIdentifier }) => universalIdentifier === COMPANY_OBJECT_ID,
    'standard Company object',
  );
  const field = exactlyOne(
    companyObject.fieldsList,
    ({ universalIdentifier }) => universalIdentifier === COMPANY_FIELD_ID,
    'Company 13F field',
  );
  if (
    field.applicationId !== application.id ||
    field.name !== 'thirteenFFirmId' ||
    field.type !== 'TEXT' ||
    field.isActive !== true ||
    field.isNullable !== true ||
    field.isUnique !== true ||
    field.isUIEditable !== false
  ) {
    throw new Error('Corgi 13F runtime Company field is incorrect');
  }
  if (command.availabilityObjectMetadataId !== companyObject.id) {
    throw new Error('Corgi 13F Company command targets the wrong object');
  }

  const pageLayout = exactlyOne(
    metadata.getPageLayouts,
    ({ universalIdentifier }) => universalIdentifier === PAGE_LAYOUT_ID,
    '13F standalone page layout',
  );
  const pageTab = exactlyOne(
    pageLayout.tabs,
    ({ universalIdentifier }) => universalIdentifier === PAGE_TAB_ID,
    '13F standalone page tab',
  );
  const pageWidget = exactlyOne(
    pageTab.widgets,
    ({ universalIdentifier }) => universalIdentifier === PAGE_WIDGET_ID,
    '13F standalone page widget',
  );
  if (
    pageLayout.applicationId !== application.id ||
    pageLayout.name !== '13F' ||
    pageLayout.type !== 'STANDALONE_PAGE' ||
    pageLayout.tabs.length !== 1 ||
    pageTab.applicationId !== application.id ||
    pageTab.widgets.length !== 1 ||
    pageWidget.applicationId !== application.id ||
    pageWidget.type !== 'FRONT_COMPONENT' ||
    pageWidget.configuration?.configurationType !== 'FRONT_COMPONENT' ||
    pageWidget.configuration.frontComponentId !== workspaceFrontComponent.id
  ) {
    throw new Error('Corgi 13F runtime page layout is incorrect');
  }

  const navigation = exactlyOne(
    metadata.navigationMenuItems,
    ({ applicationId }) => applicationId === application.id,
    `13F navigation item sourced from ${NAVIGATION_ID}`,
  );
  if (
    navigation.name !== '13F' ||
    navigation.type !== 'PAGE_LAYOUT' ||
    navigation.pageLayoutId !== pageLayout.id
  ) {
    throw new Error('Corgi 13F runtime navigation is incorrect');
  }

  const role = exactlyOne(
    metadata.getRoles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'Corgi 13F role',
  );
  if (
    application.defaultRoleId !== role.id ||
    role.canReadAllObjectRecords !== false ||
    role.canUpdateAllObjectRecords !== false ||
    role.canSoftDeleteAllObjectRecords !== false ||
    role.canDestroyAllObjectRecords !== false ||
    role.canUpdateAllSettings !== false ||
    role.canAccessAllTools !== false ||
    role.canBeAssignedToUsers !== false ||
    role.canBeAssignedToAgents !== false ||
    role.canBeAssignedToApiKeys !== false ||
    role.objectPermissions.length !== 0 ||
    role.permissionFlags.length !== 0 ||
    role.fieldPermissions.length !== 0
  ) {
    throw new Error('Corgi 13F runtime role is incorrect');
  }
};

const verify = async () => {
  let lastError;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await verifyOnce();
      console.log('Corgi 13F native workspace is installed and verified');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  throw lastError;
};

const rollbackFreshInstallation = async () => {
  const initialState = classifyDeploymentState(await readDeploymentState());

  if (
    initialState.mode === 'absent' ||
    initialState.mode === 'registered' ||
    initialState.mode === 'registered-previous' ||
    initialState.mode === 'upgrade-required'
  ) {
    console.log(
      'No Corgi 13F installation remains; exact registration retained for safe retry when present',
    );
    return;
  }

  const result = await graphql({
    operationName: 'RollbackFreshCorgiThirteenFApplication',
    query: `mutation RollbackFreshCorgiThirteenFApplication(
      $applicationId: String!
    ) {
      uninstallApplication(universalIdentifier: $applicationId)
    }`,
    variables: { applicationId: APPLICATION_ID },
  });

  if (result.uninstallApplication !== true) {
    throw new Error('Fresh Corgi 13F application uninstall was not accepted');
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const state = classifyDeploymentState(await readDeploymentState());

    if (state.mode === 'registered') {
      console.log(
        'Fresh Corgi 13F installation was removed; exact registration retained for safe retry',
      );
      return;
    }
    if (attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  throw new Error('Fresh Corgi 13F application remained after uninstall');
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const operation = process.argv[2];

  if (operation === 'precheck') {
    await precheck();
  } else if (operation === 'assert-installable') {
    await assertInstallableRegistration();
  } else if (operation === 'upgrade') {
    await upgrade();
  } else if (operation === 'configure') {
    await configure();
  } else if (operation === 'verify') {
    await verify();
  } else if (operation === 'rollback') {
    await rollbackFreshInstallation();
  } else {
    throw new Error(
      'Expected precheck, assert-installable, upgrade, configure, verify, or rollback operation',
    );
  }
}
