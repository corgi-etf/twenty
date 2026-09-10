import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const APPLICATION_ID = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
const TRIGGER_ID = '65f68f6b-e130-4292-ab05-3ef48458d7de';
const TELEGRAM_WEBHOOK_ID = 'a7693988-ab2a-4f07-b865-b4d4808c814a';
const TELEGRAM_WORKER_ID = '32cf139c-a4bf-4d87-84f4-f70ac39a3942';
const TELEGRAM_CRON_ID = 'e61bb12c-a0f5-421b-97d2-e2596e56cf59';
const TELEGRAM_DAILY_WORKER_ID = 'a518c1f8-d80c-4260-8ef6-bd51a86b4eda';
const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parseResponse = async (response, operationName) => {
  if (!response.ok) {
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`${operationName} returned GraphQL errors`);
  }
  if (!body.data) throw new Error(`${operationName} returned no data`);
  return body.data;
};

const createGraphqlClient =
  ({ origin, apiKey }) =>
  async ({ endpoint, operationName, query, variables = {} }) =>
    parseResponse(
      await fetch(new URL(endpoint, origin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({ operationName, query, variables }),
        redirect: 'error',
      }),
      operationName,
    );

const verifyTargetWorkspace = async ({ graphql, expectedWorkspaceId }) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmTargetWorkspace',
    query: `query VerifyCorgiCrmTargetWorkspace {
      currentWorkspace { id }
    }`,
  });
  if (data.currentWorkspace?.id !== expectedWorkspaceId) {
    throw new Error(
      'Authenticated credential is not scoped to the approved workspace',
    );
  }
};

const verifyRequiredSchema = async ({ graphql }) => {
  const data = await graphql({
    endpoint: '/graphql',
    operationName: 'VerifyCorgiCrmRequiredSchema',
    query: `query VerifyCorgiCrmRequiredSchema {
      workspaceMembers(first: 1) {
        edges { node { id userEmail name { firstName lastName } } }
      }
      wholesalers(first: 1) {
        edges { node { id name email wholesalerRole workspaceMemberId } }
      }
    }`,
  });
  if (!data.workspaceMembers?.edges || !data.wholesalers?.edges) {
    throw new Error('Required Corgi CRM core schema is unavailable');
  }
};

const parseTriggerSettings = (settings) => {
  if (typeof settings !== 'string') return settings;
  try {
    return JSON.parse(settings);
  } catch {
    return null;
  }
};

const TELEGRAM_VARIABLE_KEYS = [
  'CORGI_CRM_TELEGRAM_BOT_TOKEN',
  'CORGI_CRM_TELEGRAM_WEBHOOK_SECRET',
  'CORGI_CRM_TELEGRAM_LINK_CODES',
  'CORGI_CRM_TELEGRAM_TIME_ZONE',
  'CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME',
];

const exactlyOne = (values, predicate, label) => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${matches.length}`);
  }
  return matches[0];
};

const assertIanaTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new Error('Telegram time zone must be a valid IANA zone');
  }
};

const assertQuarterHour = (value) => {
  const match = /^(?:[01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match || Number(match[1]) % 15 !== 0) {
    throw new Error('Telegram summary time must be on a 15-minute boundary');
  }
};

const resolveCorgiRoleObjectIdentifiers = (objects) => {
  const resolve = (nameSingular, environmentKey) => {
    const object = exactlyOne(
      objects,
      (candidate) =>
        candidate?.nameSingular === nameSingular && candidate.isActive === true,
      `${nameSingular} metadata object`,
    );
    if (!UUID_PATTERN.test(object.universalIdentifier ?? '')) {
      throw new Error(`${nameSingular} object universal identifier is not a UUID`);
    }
    return [environmentKey, object.universalIdentifier];
  };
  return Object.fromEntries([
    resolve(
      'wholesaler',
      'CORGI_CRM_WHOLESALER_OBJECT_UNIVERSAL_IDENTIFIER',
    ),
    resolve(
      'outreachActivity',
      'CORGI_CRM_OUTREACH_ACTIVITY_OBJECT_UNIVERSAL_IDENTIFIER',
    ),
  ]);
};

const verifyApplicationRoleContract = (role, objects) => {
  if (!role || typeof role !== 'object') {
    throw new Error('Installed application role is missing');
  }
  if (
    role.canReadAllObjectRecords !== false ||
    role.canUpdateAllObjectRecords !== false ||
    role.canSoftDeleteAllObjectRecords !== false ||
    role.canDestroyAllObjectRecords !== false ||
    role.canUpdateAllSettings !== false
  ) {
    throw new Error('Installed application role has a global permission');
  }
  const permissions = role.objectPermissions ?? [];
  if (permissions.length !== 5) {
    throw new Error('Installed application role must have exactly five object permissions');
  }
  const expected = new Map(
    [
      ['workspaceMember', false],
      ['company', false],
      ['person', false],
      ['wholesaler', true],
      ['outreachActivity', true],
    ].map(([nameSingular, writable]) => {
      const object = exactlyOne(
        objects,
        (candidate) => candidate?.nameSingular === nameSingular,
        `${nameSingular} metadata object`,
      );
      return [object.id, { nameSingular, writable }];
    }),
  );
  const seen = new Set();
  for (const permission of permissions) {
    const contract = expected.get(permission.objectMetadataId);
    if (!contract || seen.has(permission.objectMetadataId)) {
      throw new Error('Installed application role has an unexpected object permission');
    }
    seen.add(permission.objectMetadataId);
    if (
      permission.canReadObjectRecords !== true ||
      permission.canUpdateObjectRecords !== contract.writable ||
      permission.canSoftDeleteObjectRecords !== false ||
      permission.canDestroyObjectRecords !== false
    ) {
      throw new Error(
        `Installed application role has excessive ${contract.nameSingular} permission`,
      );
    }
  }
};

const verifyTelegramApplicationContract = (application, workspaceId) => {
  const variables = application.applicationVariables ?? [];
  const workspaceVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
    'workspace variable',
  );
  if (workspaceVariable.value !== workspaceId) {
    throw new Error('Telegram application workspace variable is incorrect');
  }
  const enabledVariable = exactlyOne(
    variables,
    (variable) => variable.key === 'CORGI_CRM_TELEGRAM_ENABLED',
    'Telegram enabled variable',
  );
  if (enabledVariable.value !== 'true') {
    throw new Error('Telegram application is not enabled');
  }
  for (const key of TELEGRAM_VARIABLE_KEYS) {
    const variable = exactlyOne(
      variables,
      (candidate) => candidate.key === key,
      `Telegram variable ${key}`,
    );
    if (typeof variable.value !== 'string' || !variable.value.trim()) {
      throw new Error(`Telegram variable ${key} is not configured`);
    }
  }
  const variableValue = (key) =>
    exactlyOne(
      variables,
      (candidate) => candidate.key === key,
      `Telegram variable ${key}`,
    ).value.trim();
  assertIanaTimeZone(variableValue('CORGI_CRM_TELEGRAM_TIME_ZONE'));
  assertQuarterHour(
    variableValue('CORGI_CRM_TELEGRAM_DAILY_SUMMARY_TIME'),
  );

  const functions = application.logicFunctions ?? [];
  const webhook = exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_WEBHOOK_ID,
    'Telegram webhook function',
  );
  const webhookSettings = parseTriggerSettings(
    webhook.httpRouteTriggerSettings,
  );
  if (
    webhookSettings?.path !== '/telegram/webhook' ||
    webhookSettings?.httpMethod !== 'POST' ||
    webhookSettings?.isAuthRequired !== false ||
    !Array.isArray(webhookSettings?.forwardedRequestHeaders) ||
    webhookSettings.forwardedRequestHeaders.length !== 1 ||
    webhookSettings.forwardedRequestHeaders[0]?.toLowerCase() !==
      'x-telegram-bot-api-secret-token'
  ) {
    throw new Error(
      'Telegram webhook route/header forwarding contract is not active',
    );
  }

  exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_WORKER_ID,
    'Telegram queued worker function',
  );
  const cron = exactlyOne(
    functions,
    (logicFunction) => logicFunction.universalIdentifier === TELEGRAM_CRON_ID,
    'Telegram cron function',
  );
  const cronSettings = parseTriggerSettings(cron.cronTriggerSettings);
  if (cronSettings?.pattern !== '*/15 * * * *') {
    throw new Error('Telegram cron contract is not active');
  }
  exactlyOne(
    functions,
    (logicFunction) =>
      logicFunction.universalIdentifier === TELEGRAM_DAILY_WORKER_ID,
    'Telegram daily queued worker function',
  );
};

const verifyInstalledApplication = async ({
  graphql,
  version,
  workspaceId,
}) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmInstalledApplication',
    query: `query VerifyCorgiCrmInstalledApplication {
      currentWorkspace { id }
      findManyApplications {
        universalIdentifier version state
        applicationVariables { key value }
        defaultLogicFunctionRole {
          canReadAllObjectRecords
          canUpdateAllObjectRecords
          canSoftDeleteAllObjectRecords
          canDestroyAllObjectRecords
          canUpdateAllSettings
          objectPermissions {
            objectMetadataId
            canReadObjectRecords
            canUpdateObjectRecords
            canSoftDeleteObjectRecords
            canDestroyObjectRecords
          }
        }
        logicFunctions {
          universalIdentifier
          databaseEventTriggerSettings
          httpRouteTriggerSettings
          cronTriggerSettings
        }
      }
    }`,
  });
  if (data.currentWorkspace?.id !== workspaceId) {
    throw new Error('Workspace changed while verifying the installation');
  }
  const applications = (data.findManyApplications ?? []).filter(
    (application) => application.universalIdentifier === APPLICATION_ID,
  );
  if (applications.length !== 1) {
    throw new Error(
      `Expected one installed Corgi CRM app, found ${applications.length}`,
    );
  }
  const application = applications[0];
  if (application.state !== 'INSTALLED' || application.version !== version) {
    throw new Error('Corgi CRM app is not installed at the expected version');
  }
  const workspaceVariable = (application.applicationVariables ?? []).find(
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
  );
  if (workspaceVariable?.value !== workspaceId) {
    throw new Error(
      'Installed app workspace variable does not match the approved workspace',
    );
  }
  const triggers = (application.logicFunctions ?? []).filter(
    (logicFunction) => logicFunction.universalIdentifier === TRIGGER_ID,
  );
  const settings = parseTriggerSettings(
    triggers[0]?.databaseEventTriggerSettings,
  );
  if (
    triggers.length !== 1 ||
    settings?.eventName !== 'workspaceMember.created'
  ) {
    throw new Error('Corgi CRM member-created database trigger is not active');
  }
  return application;
};

const listAllMetadataObjects = async ({ graphql }) => {
  const objects = [];
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql({
      endpoint: '/metadata',
      operationName: 'VerifyCorgiCrmMetadataObjects',
      query: `query VerifyCorgiCrmMetadataObjects($after: String) {
        objects(paging: { first: ${PAGE_SIZE}, after: $after }, filter: {}) {
          edges { node { id nameSingular universalIdentifier isActive } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { after: cursor ?? null },
    });
    const connection = data.objects;
    if (!connection || !Array.isArray(connection.edges)) {
      throw new Error('Metadata object verification returned an invalid connection');
    }
    objects.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));
    if (!connection.pageInfo?.hasNextPage) return objects;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error('Metadata object verification returned an invalid cursor');
    }
    seenCursors.add(cursor);
  }
  throw new Error(`Metadata object verification exceeded ${MAX_PAGES} pages`);
};

const listAllRecords = async ({ graphql, operationName, root, selection }) => {
  const records = [];
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql({
      endpoint: '/graphql',
      operationName,
      query: `query ${operationName}($after: String) {
        ${root}(first: ${PAGE_SIZE}, after: $after) {
          edges { node { ${selection} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { after: cursor ?? null },
    });
    const connection = data[root];
    if (!connection || !Array.isArray(connection.edges)) {
      throw new Error(`${operationName} returned an invalid connection`);
    }
    records.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));
    if (!connection.pageInfo?.hasNextPage) return records;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error(`${operationName} returned an invalid pagination cursor`);
    }
    seenCursors.add(cursor);
  }
  throw new Error(`${operationName} exceeded ${MAX_PAGES} pages`);
};

const normalizeEmail = (value) => value.trim().toLowerCase();
const normalizeNamePart = (value) => value?.trim().replace(/\s+/g, ' ') ?? '';
const expectedName = (member) => {
  const fullName = [member.name?.firstName, member.name?.lastName]
    .map(normalizeNamePart)
    .filter(Boolean)
    .join(' ');
  return (
    fullName || normalizeEmail(member.userEmail).split('@')[0] || 'Wholesaler'
  );
};

const verifyReconciliation = ({ members, wholesalers }) => {
  const usableMembers = members.filter(
    (member) => member.id?.trim() && member.userEmail?.trim(),
  );
  const memberIds = new Set(
    members.filter((member) => member.id?.trim()).map((member) => member.id),
  );
  for (const member of usableMembers) {
    const email = normalizeEmail(member.userEmail);
    const matches = wholesalers.filter(
      (wholesaler) =>
        wholesaler.workspaceMemberId === member.id ||
        normalizeEmail(wholesaler.email ?? '') === email,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Workspace member ${member.id} has ${matches.length} identities`,
      );
    }
    const wholesaler = matches[0];
    if (
      wholesaler.workspaceMemberId !== member.id ||
      normalizeEmail(wholesaler.email ?? '') !== email ||
      normalizeNamePart(wholesaler.name) !== expectedName(member) ||
      !wholesaler.wholesalerRole?.trim()
    ) {
      throw new Error(`Workspace member ${member.id} has a stale identity`);
    }
  }
  const orphanCount = wholesalers.filter(
    (wholesaler) =>
      wholesaler.workspaceMemberId?.trim() &&
      !memberIds.has(wholesaler.workspaceMemberId),
  ).length;
  if (orphanCount > 0) {
    throw new Error(
      `${orphanCount} identities link to absent workspace members`,
    );
  }
  return { members: usableMembers.length, wholesalers: wholesalers.length };
};

const main = async () => {
  const mode = process.argv[2];
  if (
    mode !== 'target' &&
    mode !== 'role-env' &&
    mode !== 'installed' &&
    mode !== 'telegram'
  ) {
    throw new Error(
      'Usage: verify-production-install.mjs <target|role-env|installed|telegram>',
    );
  }
  const origin = new URL(requiredEnvironment('CORGI_CRM_API_URL')).origin;
  const workspaceId = requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID');
  if (origin !== APPROVED_ORIGIN || !UUID_PATTERN.test(workspaceId)) {
    throw new Error('Production origin or derived workspace ID is invalid');
  }
  const graphql = createGraphqlClient({
    origin,
    apiKey: requiredEnvironment('CORGI_CRM_API_KEY'),
  });
  await verifyTargetWorkspace({ graphql, expectedWorkspaceId: workspaceId });
  await verifyRequiredSchema({ graphql });
  if (mode === 'target') {
    console.log('Verified Corgi CRM production target workspace.');
    return;
  }

  const metadataObjects = await listAllMetadataObjects({ graphql });
  if (mode === 'role-env') {
    const outputPath = requiredEnvironment('CORGI_CRM_ROLE_ENV_PATH');
    const identifiers = resolveCorgiRoleObjectIdentifiers(metadataObjects);
    await appendFile(
      outputPath,
      `${Object.entries(identifiers)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
      'utf8',
    );
    console.log('Resolved Corgi CRM role object identifiers for packaging.');
    return;
  }

  const application = await verifyInstalledApplication({
    graphql,
    version: requiredEnvironment('CORGI_CRM_EXPECTED_VERSION'),
    workspaceId,
  });
  verifyApplicationRoleContract(
    application.defaultLogicFunctionRole,
    metadataObjects,
  );
  const [members, wholesalers] = await Promise.all([
    listAllRecords({
      graphql,
      operationName: 'VerifyCorgiCrmWorkspaceMembers',
      root: 'workspaceMembers',
      selection: 'id userEmail name { firstName lastName }',
    }),
    listAllRecords({
      graphql,
      operationName: 'VerifyCorgiCrmWholesalers',
      root: 'wholesalers',
      selection: 'id name email wholesalerRole workspaceMemberId',
    }),
  ]);
  const result = verifyReconciliation({ members, wholesalers });
  if (mode === 'telegram') {
    verifyTelegramApplicationContract(application, workspaceId);
  }
  console.log(
    `Verified installed app, active trigger, and ${result.members} member identities across ${result.wholesalers} wholesalers${mode === 'telegram' ? ', including the configured Telegram topology' : ''}.`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export {
  resolveCorgiRoleObjectIdentifiers,
  verifyApplicationRoleContract,
  verifyReconciliation,
  verifyTelegramApplicationContract,
};
