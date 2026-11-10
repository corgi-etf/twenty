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
const FILING_OBJECT_ID = '42f51bb6-3a42-43fd-8202-2f9196f0b03a';
const MANAGER_OBJECT_ID = 'a6c6ba92-47a2-4aaf-b10a-0d13eff6198e';
const SECURITY_OBJECT_ID = '1fbb403a-ecd3-402b-aeb5-2ce9fd14d2dd';
const HOLDING_OBJECT_ID = '9c6ceb0f-0c49-4f52-86f0-0762c7aca7ff';
const HOLDING_IS_ACTIVE_FIELD_ID = '4e19bbfd-8d4f-4eda-939a-62b721f8fdfc';
const HOLDING_ACTIVE_VIEW_FILTER_ID =
  '380fa436-cc3e-4e31-8e61-8ad3f51c3eb8';
const IMPORT_RUN_OBJECT_ID = '6fcd2cba-af82-42ae-8ed3-975a3ff98b87';
const IMPORT_ERROR_OBJECT_ID = '5ddcd92f-eece-43fc-8395-355402c4dea3';
const ROLE_ID = '74e11c1b-ed63-4d94-bf2a-89db86edcf39';
const OBJECT_CONTRACTS = [
  {
    universalIdentifier: FILING_OBJECT_ID,
    nameSingular: 'thirteenFFiling',
    namePlural: 'thirteenFFilings',
    requiredFieldIds: [
      '5a88b36a-beae-4b07-b3b1-ee5025f4113e',
      'ce9040dc-d05b-40b8-8ada-d81e1f30b9af',
      '0f8f0907-75e2-455c-af5c-409e5f11ff46',
      '46cbacff-14c9-4dd4-9276-19b9c8e2053c',
      '0540519f-2f64-4429-a72a-9f77e9923f2a',
      '478e72a0-f304-4cff-9683-41a34a173533',
      'e36b4226-5d8e-447f-a5ce-1916df0625a3',
    ],
  },
  {
    universalIdentifier: MANAGER_OBJECT_ID,
    nameSingular: 'thirteenFManager',
    namePlural: 'thirteenFManagers',
    requiredFieldIds: [
      '2be43573-984c-4d1e-b89c-e76ed1111869',
      '22b425f7-e505-4905-b420-18075af151d7',
      '4f50049d-8047-4365-b984-2a9ea420a818',
    ],
  },
  {
    universalIdentifier: SECURITY_OBJECT_ID,
    nameSingular: 'thirteenFSecurity',
    namePlural: 'thirteenFSecurities',
    requiredFieldIds: [
      'adc5b9af-7d25-4702-9907-912891f2a6e8',
      'faf1ca43-b165-4685-b9eb-7e5d30ccfeb1',
      'a9f2ccae-8f01-4494-90bc-0ac225efc1f8',
    ],
  },
  {
    universalIdentifier: HOLDING_OBJECT_ID,
    nameSingular: 'thirteenFHolding',
    namePlural: 'thirteenFHoldings',
    requiredFieldIds: [
      '39bab5b3-f1a4-4a33-a6b1-e600321ed2b7',
      '88f03025-50c2-484b-9faa-e472c7033490',
      '807c2abc-5be3-4342-ae53-7e6b729c4edb',
      '157b8866-c974-43ce-8792-be9be2d80224',
      '78740f18-ed8f-4dd2-9e4a-d6adffefed10',
      '94d62658-7013-4637-9428-53dd00f132de',
      '2c5b146b-80ec-4746-9093-bef5b4f5eea4',
      '3dd5fb8a-1c4d-44bb-a40c-909efddb66e5',
      '4e19bbfd-8d4f-4eda-939a-62b721f8fdfc',
      '294e5106-11fb-40fe-8602-9457f9a5d310',
    ],
  },
  {
    universalIdentifier: IMPORT_RUN_OBJECT_ID,
    nameSingular: 'thirteenFImportRun',
    namePlural: 'thirteenFImportRuns',
    requiredFieldIds: [
      '70f0b469-edbf-43e9-8a64-ac7c16447e92',
      '5563d1e7-48fa-4799-a80a-aef24e6c2b17',
      '00a380e9-871b-4150-b12c-d6775cbaa464',
      '8b718d4f-364d-4c57-a334-0f0244d60d0e',
      'ae2ce61c-dda2-4a8f-ae80-7d071ebdba4d',
      'cbb8d35c-55d7-48b6-8f58-1df46d3169db',
      '96bbea24-8ac2-46ae-a663-7861c1e95ff2',
      '7ba86ee9-d838-4fb6-b283-a39347de7087',
      '225ebc5d-1df4-4ab8-8182-efa414bfc362',
    ],
  },
  {
    universalIdentifier: IMPORT_ERROR_OBJECT_ID,
    nameSingular: 'thirteenFImportError',
    namePlural: 'thirteenFImportErrors',
    requiredFieldIds: [
      'ee572de2-c2cb-4a05-86f8-9f6891f0771b',
      '59f42b2b-f719-40d9-b465-735927262fed',
      'feda086b-299d-4728-8875-0897526b655c',
      '32a939ea-c8f9-4655-a27c-7d0f46ee8188',
      'af9f590b-9fd8-47e0-ba5b-4f62ecf1dace',
      'e8ab37ec-8115-49f0-8ee4-972b2e650d6a',
      '082fed09-ecd0-4278-882e-864201926f76',
    ],
  },
];
const VIEW_CONTRACTS = [
  {
    key: 'filingViews',
    universalIdentifier: 'e598657f-5627-4df7-9c73-51ac1a9ec40e',
    objectUniversalIdentifier: FILING_OBJECT_ID,
    name: 'All 13F filings',
    navigationUniversalIdentifier: '7cb2d1fc-c0eb-407a-9a4b-a519fbb70f9a',
    navigationName: '13F Filings',
    fieldIds: [
      '4964d8a9-a6b9-4e5f-9ff3-aaa9b8a9f8ef',
      '2fd687e4-311d-419c-af30-fc51f0be19ce',
      '94b5818c-8fc4-48cc-aafa-754811b2f73e',
      'c6a7579d-9ac5-414c-bc01-e692b68653b2',
      '144f9341-1384-4f95-98f0-51828de9a57d',
      '2eb08844-ef53-4e06-87b9-dd7659f19aae',
    ],
  },
  {
    key: 'managerViews',
    universalIdentifier: '60254ecf-ab3e-4028-8edd-f489a9db58e7',
    objectUniversalIdentifier: MANAGER_OBJECT_ID,
    name: 'All 13F firms',
    navigationUniversalIdentifier: '49947326-15af-430d-9c6d-b4d4fc291fce',
    navigationName: '13F Firms',
    fieldIds: [
      'b68b81f5-3a95-4121-b26a-e4cb684bb75e',
      '40207b60-e039-474b-90fa-328eadb08724',
      '737de8f1-04cb-4347-84d7-df8cd37f6e20',
      '88de5ac3-7dd7-4aaa-9f39-fa525e77a24a',
      'f0410188-99a0-4b61-bcb7-bbedee02019c',
    ],
  },
  {
    key: 'securityViews',
    universalIdentifier: '46a395eb-105d-4dce-8358-99de47279e4c',
    objectUniversalIdentifier: SECURITY_OBJECT_ID,
    name: 'All 13F securities',
    navigationUniversalIdentifier: '6b32ede9-3ff1-468b-a87d-56e1c6372917',
    navigationName: '13F Securities',
    fieldIds: [
      '36ddfe01-cab3-4cb6-85ca-3467454ea080',
      '76a6a731-2c7e-4889-a97e-c69360f4ed0b',
    ],
  },
  {
    key: 'holdingViews',
    universalIdentifier: 'b4bc99c9-eacc-490d-baa2-d26f94131a41',
    objectUniversalIdentifier: HOLDING_OBJECT_ID,
    name: 'All 13F holdings',
    navigationUniversalIdentifier: 'f640c94c-2c8b-4fe3-9043-11385d2367e2',
    navigationName: '13F Holdings',
    fieldIds: [
      '8272ef8e-166b-4898-a420-1cb9e01d2c55',
      '3e624603-1437-44c6-b776-304b1471dc52',
      '715f481a-5d1c-4e77-b9da-1a457f00149c',
      'badf2a89-a52a-4684-b3f7-0a3fb18a9981',
      '8baa1d2c-a171-45a4-87a0-c3b9ec9ff596',
      '0965b9df-6ccf-42ed-8824-f50a475128e8',
      'e345f81d-07f3-4237-9dfd-f6707ba40578',
    ],
    filter: {
      universalIdentifier: HOLDING_ACTIVE_VIEW_FILTER_ID,
      fieldUniversalIdentifier: HOLDING_IS_ACTIVE_FIELD_ID,
      operand: 'IS',
      value: true,
    },
  },
  {
    key: 'importRunViews',
    universalIdentifier: 'dbe6e047-4366-4e31-be1d-cf88b27e650f',
    objectUniversalIdentifier: IMPORT_RUN_OBJECT_ID,
    name: 'All 13F imports',
    navigationUniversalIdentifier: '08f8b6ac-7942-484a-b4c8-2124e2a88186',
    navigationName: '13F Imports',
    fieldIds: [
      '863778fb-d78f-470f-860f-fe38843013ae',
      '46ef8f6b-dd79-4891-8e00-e5d8b7ca1586',
      'f559373c-ad21-4bc7-85ff-4954ed7e7a92',
      '067c0e27-13b1-4430-a5c7-4d107151dad4',
      'a9a1d128-2c53-487d-904b-4d8a71a0b5c9',
      'c7e53415-b405-467d-aa06-378b4cfd70d4',
    ],
  },
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
        appRegistrationId: (
          await readDeploymentState()
        ).registration.id,
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
        objects {
          id universalIdentifier nameSingular namePlural applicationId
          fieldsList {
            id universalIdentifier name type isActive isNullable isUnique
          }
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

  const objectsByUniversalIdentifier = new Map();
  for (const contract of OBJECT_CONTRACTS) {
    const object = exactlyOne(
      application.objects,
      ({ universalIdentifier }) =>
        universalIdentifier === contract.universalIdentifier,
      `Corgi 13F ${contract.nameSingular} object`,
    );

    if (
      object.applicationId !== application.id ||
      object.nameSingular !== contract.nameSingular ||
      object.namePlural !== contract.namePlural
    ) {
      throw new Error(
        `Corgi 13F ${contract.nameSingular} object contract is incorrect`,
      );
    }
    for (const fieldId of contract.requiredFieldIds) {
      const field = exactlyOne(
        object.fieldsList,
        ({ universalIdentifier }) => universalIdentifier === fieldId,
        `active Corgi 13F field ${fieldId}`,
      );

      if (field.isActive !== true) {
        throw new Error(`Corgi 13F field ${fieldId} is not active`);
      }
    }
    objectsByUniversalIdentifier.set(contract.universalIdentifier, object);
  }
  const filingObject = objectsByUniversalIdentifier.get(FILING_OBJECT_ID);

  if (application.objects.length !== OBJECT_CONTRACTS.length) {
    throw new Error('Corgi 13F application object set is incorrect');
  }

  const importPendingFileIdField = exactlyOne(
    filingObject.fieldsList,
    ({ universalIdentifier }) =>
      universalIdentifier === '0540519f-2f64-4429-a72a-9f77e9923f2a',
    'Corgi 13F importPendingFileId field',
  );
  const sourceNodeIdField = exactlyOne(
    filingObject.fieldsList,
    ({ universalIdentifier }) =>
      universalIdentifier === '0f8f0907-75e2-455c-af5c-409e5f11ff46',
    'Corgi 13F sourceNodeId field',
  );

  if (
    importPendingFileIdField.name !== 'importPendingFileId' ||
    importPendingFileIdField.type !== 'TEXT' ||
    importPendingFileIdField.isActive !== true ||
    importPendingFileIdField.isNullable !== true ||
    sourceNodeIdField.name !== 'sourceNodeId' ||
    sourceNodeIdField.type !== 'TEXT' ||
    sourceNodeIdField.isActive !== true ||
    sourceNodeIdField.isNullable !== true ||
    sourceNodeIdField.isUnique !== true
  ) {
    throw new Error('Corgi 13F resumable import field contract is incorrect');
  }

  const metadata = await graphql({
    operationName: 'VerifyCorgiThirteenFMetadata',
    query: `query VerifyCorgiThirteenFMetadata(
      $applicationId: UUID!
      $filingObjectMetadataId: String!
      $managerObjectMetadataId: String!
      $securityObjectMetadataId: String!
      $holdingObjectMetadataId: String!
      $importRunObjectMetadataId: String!
    ) {
      currentWorkspace { id displayName }
      exportApplication(universalIdentifier: $applicationId) {
        application { universalIdentifier }
        manifest
      }
      filingViews: getViews(objectMetadataId: $filingObjectMetadataId) {
        id universalIdentifier applicationId name objectMetadataId type isActive
        viewFields { universalIdentifier applicationId isVisible isActive }
      }
      managerViews: getViews(objectMetadataId: $managerObjectMetadataId) {
        id universalIdentifier applicationId name objectMetadataId type isActive
        viewFields { universalIdentifier applicationId isVisible isActive }
      }
      securityViews: getViews(objectMetadataId: $securityObjectMetadataId) {
        id universalIdentifier applicationId name objectMetadataId type isActive
        viewFields { universalIdentifier applicationId isVisible isActive }
      }
      holdingViews: getViews(objectMetadataId: $holdingObjectMetadataId) {
        id universalIdentifier applicationId name objectMetadataId type isActive
        viewFields { universalIdentifier applicationId isVisible isActive }
        viewFilters { fieldMetadataId operand value viewId }
      }
      importRunViews: getViews(objectMetadataId: $importRunObjectMetadataId) {
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
      filingObjectMetadataId: objectsByUniversalIdentifier.get(FILING_OBJECT_ID).id,
      managerObjectMetadataId: objectsByUniversalIdentifier.get(MANAGER_OBJECT_ID).id,
      securityObjectMetadataId: objectsByUniversalIdentifier.get(SECURITY_OBJECT_ID).id,
      holdingObjectMetadataId: objectsByUniversalIdentifier.get(HOLDING_OBJECT_ID).id,
      importRunObjectMetadataId: objectsByUniversalIdentifier.get(IMPORT_RUN_OBJECT_ID).id,
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

  for (const contract of OBJECT_CONTRACTS) {
    exactlyOne(
      manifest.objects,
      ({ universalIdentifier }) =>
        universalIdentifier === contract.universalIdentifier,
      `exported Corgi 13F ${contract.nameSingular} object manifest`,
    );
  }
  for (const contract of VIEW_CONTRACTS) {
    const exportedView = exactlyOne(
      manifest.views,
      ({ universalIdentifier }) =>
        universalIdentifier === contract.universalIdentifier,
      `exported Corgi 13F ${contract.name} view manifest`,
    );
    const exportedNavigation = exactlyOne(
      manifest.navigationMenuItems,
      ({ universalIdentifier }) =>
        universalIdentifier === contract.navigationUniversalIdentifier,
      `exported Corgi 13F ${contract.navigationName} navigation manifest`,
    );

    if (
      exportedView.objectUniversalIdentifier !==
        contract.objectUniversalIdentifier ||
      exportedNavigation.viewUniversalIdentifier !==
        contract.universalIdentifier
    ) {
      throw new Error(
        `Corgi 13F ${contract.name} exported view or navigation link is incorrect`,
      );
    }
    if (contract.filter) {
      const filter = exactlyOne(
        exportedView.filters,
        ({ universalIdentifier }) =>
          universalIdentifier === contract.filter.universalIdentifier,
        `exported Corgi 13F ${contract.name} active filter`,
      );

      if (
        filter.fieldMetadataUniversalIdentifier !==
          contract.filter.fieldUniversalIdentifier ||
        filter.operand !== contract.filter.operand ||
        filter.value !== contract.filter.value
      ) {
        throw new Error(
          `Corgi 13F ${contract.name} exported filter is incorrect`,
        );
      }
    }
  }
  exactlyOne(
    manifest.roles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'exported Corgi 13F role manifest',
  );
  for (const contract of VIEW_CONTRACTS) {
    const object = objectsByUniversalIdentifier.get(
      contract.objectUniversalIdentifier,
    );
    const view = exactlyOne(
      metadata[contract.key],
      ({ universalIdentifier }) =>
        universalIdentifier === contract.universalIdentifier,
      `Corgi 13F ${contract.name} view`,
    );

    if (
      view.applicationId !== application.id ||
      view.objectMetadataId !== object.id ||
      view.name !== contract.name ||
      view.type !== 'TABLE' ||
      view.isActive !== true ||
      !sameSet(
        (view.viewFields ?? []).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        contract.fieldIds,
      ) ||
      (view.viewFields ?? []).some(
        ({ applicationId, isVisible, isActive }) =>
          applicationId !== application.id ||
          isVisible !== true ||
          isActive !== true,
      )
    ) {
      throw new Error(`Corgi 13F ${contract.name} view contract is incorrect`);
    }
    if (contract.filter) {
      const field = exactlyOne(
        object.fieldsList,
        ({ universalIdentifier }) =>
          universalIdentifier === contract.filter.fieldUniversalIdentifier,
        `Corgi 13F ${contract.name} active filter field`,
      );
      const filter = exactlyOne(
        view.viewFilters,
        ({ fieldMetadataId }) => fieldMetadataId === field.id,
        `Corgi 13F ${contract.name} active runtime filter`,
      );

      if (
        view.viewFilters.length !== 1 ||
        filter.viewId !== view.id ||
        filter.operand !== 'IS' ||
        filter.value !== true
      ) {
        throw new Error(
          `Corgi 13F ${contract.name} active runtime filter is incorrect`,
        );
      }
    }

    // The public DTO omits the universal identifier. The exported manifest
    // proves that identifier; this live query proves the runtime view link.
    const navigation = exactlyOne(
      metadata.navigationMenuItems,
      ({ applicationId, viewId, type, name }) =>
        applicationId === application.id &&
        viewId === view.id &&
        type === 'VIEW' &&
        name === contract.navigationName,
      `Corgi 13F navigation item sourced from ${contract.navigationUniversalIdentifier}`,
    );

    if (!navigation.id) {
      throw new Error(
        `Corgi 13F ${contract.navigationName} navigation item has no runtime identity`,
      );
    }
  }

  const role = exactlyOne(
    metadata.getRoles,
    ({ universalIdentifier }) => universalIdentifier === ROLE_ID,
    'Corgi 13F role',
  );
  const objectPermissions = OBJECT_CONTRACTS.map((contract) =>
    exactlyOne(
      role.objectPermissions,
      ({ objectMetadataId }) =>
        objectMetadataId ===
        objectsByUniversalIdentifier.get(contract.universalIdentifier).id,
      `Corgi 13F ${contract.nameSingular} object permission`,
    ),
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
    role.objectPermissions.length !== OBJECT_CONTRACTS.length ||
    objectPermissions.some(
      (permission) =>
        permission.canReadObjectRecords !== true ||
        permission.canUpdateObjectRecords !== true ||
        permission.canSoftDeleteObjectRecords !== false ||
        permission.canDestroyObjectRecords !== false,
    )
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

const rollbackFreshInstallation = async () => {
  const initialState = classifyDeploymentState(await readDeploymentState());

  if (
    initialState.mode === 'absent' ||
    initialState.mode === 'registered' ||
    initialState.mode === 'registered-previous' ||
    initialState.mode === 'upgrade-required'
  ) {
    console.log(
      'No Corgi 13F installation remains; retaining an exact registration for safe retry when present',
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
  } else if (operation === 'verify') {
    await verify();
  } else if (operation === 'upgrade') {
    await upgrade();
  } else if (operation === 'rollback') {
    await rollbackFreshInstallation();
  } else {
    throw new Error(
      'Expected precheck, assert-installable, upgrade, verify, or rollback operation',
    );
  }
}
