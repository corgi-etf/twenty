import { appendFile, chmod } from 'node:fs/promises';

const API_URL = 'https://crm.corgiinvest.com';
const WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const WORKSPACE_NAME = 'Corgi ETF';
const APPLICATION_ID = '38ba5a6a-430e-455a-a27b-fba07af35944';
const OBJECT_ID = '42f51bb6-3a42-43fd-8202-2f9196f0b03a';
const VIEW_ID = 'e598657f-5627-4df7-9c73-51ac1a9ec40e';
const NAVIGATION_ID = '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a';
const ROLE_ID = '74e11c1b-ed63-4d94-bf2a-89db86edcf39';
const VERSION = '0.1.0';
const EXPECTED_FIELD_IDS = [
  '5a88b36a-beae-4b07-b3b1-ee5025f4113e',
  'b38f4874-b196-4878-93ad-55472a73cd14',
  '88cb1224-ea92-488e-a67e-681932ff08df',
  'e94f0c13-a0cf-43a6-8f06-c72d1bf66639',
  'ce9040dc-d05b-40b8-8ada-d81e1f30b9af',
  '5f6d0bac-b01b-424e-aa99-354ad0d2eca9',
  '0f8f0907-75e2-455c-af5c-409e5f11ff46',
  '46cbacff-14c9-4dd4-9276-19b9c8e2053c',
  '7f56dc80-df74-461d-9c48-cea172628b9f',
  '5caab33f-a98a-485b-b3d3-47897db395c1',
];
const EXPECTED_VIEW_FIELD_IDS = [
  '4964d8a9-a6b9-4e5f-9ff3-aaa9b8a9f8ef',
  '2fd687e4-311d-419c-af30-fc51f0be19ce',
  '94b5818c-8fc4-48cc-aafa-754811b2f73e',
  'c6a7579d-9ac5-414c-bc01-e692b68653b2',
  '144f9341-1384-4f95-98f0-51828de9a57d',
  '2eb08844-ef53-4e06-87b9-dd7659f19aae',
];

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

const sameSet = (actual, expected) =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

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
    workspace?.id !== WORKSPACE_ID ||
    workspace?.displayName !== WORKSPACE_NAME
  ) {
    throw new Error('Production workspace identity changed');
  }
};

const listApplications = async () => {
  const data = await graphql({
    operationName: 'PrecheckCorgiThirteenFApplication',
    query: `query PrecheckCorgiThirteenFApplication {
      currentWorkspace { id displayName }
      findManyApplications { id universalIdentifier version state }
    }`,
  });

  assertTenant(data.currentWorkspace);

  return (data.findManyApplications ?? []).filter(
    ({ universalIdentifier }) => universalIdentifier === APPLICATION_ID,
  );
};

const precheck = async () => {
  const matches = await listApplications();

  if (matches.length > 1) {
    throw new Error(`Found ${matches.length} installed Corgi 13F applications`);
  }

  const freshInstall = matches.length === 0;
  const outputPath = requiredEnvironment('CORGI_THIRTEEN_F_OUTPUT_PATH');

  await appendFile(outputPath, `fresh_install=${freshInstall}\n`, {
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
  console.log(
    `Corgi 13F application precheck: ${freshInstall ? 'not installed' : 'already installed'}`,
  );
};

const verifyOnce = async () => {
  const applicationData = await graphql({
    operationName: 'VerifyCorgiThirteenFApplication',
    query: `query VerifyCorgiThirteenFApplication($applicationId: UUID!) {
      currentWorkspace { id displayName }
      findOneApplication(universalIdentifier: $applicationId) {
        id universalIdentifier version state defaultRoleId
        objects {
          id universalIdentifier nameSingular namePlural applicationId
          fieldsList { universalIdentifier name type isActive }
        }
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

  const object = exactlyOne(
    application.objects,
    ({ universalIdentifier }) => universalIdentifier === OBJECT_ID,
    'Corgi 13F object',
  );

  if (
    object.applicationId !== application.id ||
    object.nameSingular !== 'thirteenFFiling' ||
    object.namePlural !== 'thirteenFFilings'
  ) {
    throw new Error('Corgi 13F object contract is incorrect');
  }

  for (const fieldId of EXPECTED_FIELD_IDS) {
    const field = exactlyOne(
      object.fieldsList,
      ({ universalIdentifier }) => universalIdentifier === fieldId,
      `active Corgi 13F field ${fieldId}`,
    );

    if (field.isActive !== true) {
      throw new Error(`Corgi 13F field ${fieldId} is not active`);
    }
  }

  const metadata = await graphql({
    operationName: 'VerifyCorgiThirteenFMetadata',
    query: `query VerifyCorgiThirteenFMetadata(
      $applicationId: UUID!
      $objectMetadataId: String!
    ) {
      currentWorkspace { id displayName }
      exportApplication(universalIdentifier: $applicationId) {
        application { universalIdentifier }
        manifest
      }
      getViews(objectMetadataId: $objectMetadataId) {
        id universalIdentifier applicationId name objectMetadataId type isActive
        viewFields { universalIdentifier applicationId isVisible isActive }
      }
      navigationMenuItems { id applicationId viewId type name }
      getRoles {
        id universalIdentifier
        canReadAllObjectRecords canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords canDestroyAllObjectRecords
        canUpdateAllSettings canBeAssignedToUsers canBeAssignedToAgents
        canBeAssignedToApiKeys
        permissionFlags { flag }
        objectPermissions {
          objectMetadataId canReadObjectRecords canUpdateObjectRecords
          canSoftDeleteObjectRecords canDestroyObjectRecords
        }
      }
    }`,
    variables: {
      applicationId: APPLICATION_ID,
      objectMetadataId: object.id,
    },
  });

  assertTenant(metadata.currentWorkspace);
  const exported = metadata.exportApplication;
  const manifest = exported?.manifest;

  if (
    exported?.application?.universalIdentifier !== APPLICATION_ID ||
    manifest?.application?.universalIdentifier !== APPLICATION_ID ||
    manifest?.application?.defaultRoleUniversalIdentifier !== ROLE_ID
  ) {
    throw new Error('Corgi 13F exported application manifest is incorrect');
  }

  exactlyOne(
    manifest.objects,
    ({ universalIdentifier }) => universalIdentifier === OBJECT_ID,
    'exported Corgi 13F object manifest',
  );
  const exportedView = exactlyOne(
    manifest.views,
    ({ universalIdentifier }) => universalIdentifier === VIEW_ID,
    'exported Corgi 13F view manifest',
  );
  const exportedNavigation = exactlyOne(
    manifest.navigationMenuItems,
    ({ universalIdentifier }) => universalIdentifier === NAVIGATION_ID,
    'exported Corgi 13F navigation manifest',
  );
  exactlyOne(
    manifest.roles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'exported Corgi 13F role manifest',
  );

  if (
    exportedView.objectUniversalIdentifier !== OBJECT_ID ||
    exportedNavigation.viewUniversalIdentifier !== VIEW_ID
  ) {
    throw new Error('Corgi 13F exported view or navigation link is incorrect');
  }

  const view = exactlyOne(
    metadata.getViews,
    ({ universalIdentifier }) => universalIdentifier === VIEW_ID,
    'Corgi 13F view',
  );

  if (
    view.applicationId !== application.id ||
    view.objectMetadataId !== object.id ||
    view.name !== 'All 13F filings' ||
    view.type !== 'TABLE' ||
    view.isActive !== true ||
    !sameSet(
      (view.viewFields ?? []).map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
      EXPECTED_VIEW_FIELD_IDS,
    ) ||
    (view.viewFields ?? []).some(
      ({ applicationId, isVisible, isActive }) =>
        applicationId !== application.id ||
        isVisible !== true ||
        isActive !== true,
    )
  ) {
    throw new Error('Corgi 13F view contract is incorrect');
  }

  // The public NavigationMenuItem DTO does not expose universalIdentifier, so
  // the export above verifies that UUID while this query verifies its live link.
  const navigation = exactlyOne(
    metadata.navigationMenuItems,
    ({ applicationId, viewId, type, name }) =>
      applicationId === application.id &&
      viewId === view.id &&
      type === 'VIEW' &&
      name === '13F Filings',
    `Corgi 13F navigation item sourced from ${NAVIGATION_ID}`,
  );

  if (!navigation.id) {
    throw new Error('Corgi 13F navigation item has no runtime identity');
  }

  const role = exactlyOne(
    metadata.getRoles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'Corgi 13F role',
  );
  const objectPermission = exactlyOne(
    role.objectPermissions,
    ({ objectMetadataId }) => objectMetadataId === object.id,
    'Corgi 13F object permission',
  );

  if (
    application.defaultRoleId !== role.id ||
    role.canReadAllObjectRecords !== false ||
    role.canUpdateAllObjectRecords !== false ||
    role.canSoftDeleteAllObjectRecords !== false ||
    role.canDestroyAllObjectRecords !== false ||
    role.canUpdateAllSettings !== false ||
    role.canBeAssignedToUsers !== false ||
    role.canBeAssignedToAgents !== false ||
    role.canBeAssignedToApiKeys !== false ||
    !sameSet(
      (role.permissionFlags ?? []).map(({ flag }) => flag),
      ['UPLOAD_FILE'],
    ) ||
    objectPermission.canReadObjectRecords !== true ||
    objectPermission.canUpdateObjectRecords !== true ||
    objectPermission.canSoftDeleteObjectRecords !== false ||
    objectPermission.canDestroyObjectRecords !== false
  ) {
    throw new Error('Corgi 13F role contract is incorrect');
  }
};

const verify = async () => {
  let lastError;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await verifyOnce();
      console.log('Corgi 13F application contract is installed and verified');
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

const uninstall = async () => {
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
    if ((await listApplications()).length === 0) {
      console.log(
        'Fresh Corgi 13F installation was removed after verification failure',
      );
      return;
    }
    if (attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  throw new Error('Fresh Corgi 13F application remained after uninstall');
};

const operation = process.argv[2];

if (operation === 'precheck') {
  await precheck();
} else if (operation === 'verify') {
  await verify();
} else if (operation === 'uninstall') {
  await uninstall();
} else {
  throw new Error('Expected precheck, verify, or uninstall operation');
}
