const APPLICATION_ID = 'ca87ad48-b62a-41be-a790-7c17707ff1b4';
const TRIGGER_ID = '65f68f6b-e130-4292-ab05-3ef48458d7de';
const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
const APPROVED_WORKSPACE_ID = 'eabf5d9d-fc99-4acb-b160-710ecb1db996';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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

const createGraphqlClient = ({ origin, apiKey }) => async ({
  endpoint,
  operationName,
  query,
  variables = {},
}) =>
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
    throw new Error('Authenticated credential is not scoped to the approved workspace');
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
        edges { node { id name email role workspaceMemberId } }
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

const verifyInstalledApplication = async ({ graphql, version, workspaceId }) => {
  const data = await graphql({
    endpoint: '/metadata',
    operationName: 'VerifyCorgiCrmInstalledApplication',
    query: `query VerifyCorgiCrmInstalledApplication {
      currentWorkspace { id }
      findManyApplications {
        universalIdentifier version state
        applicationVariables { key value }
        logicFunctions { universalIdentifier databaseEventTriggerSettings }
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
    throw new Error(`Expected one installed Corgi CRM app, found ${applications.length}`);
  }
  const application = applications[0];
  if (application.state !== 'INSTALLED' || application.version !== version) {
    throw new Error('Corgi CRM app is not installed at the expected version');
  }
  const workspaceVariable = (application.applicationVariables ?? []).find(
    (variable) => variable.key === 'CORGI_CRM_WORKSPACE_ID',
  );
  if (workspaceVariable?.value !== workspaceId) {
    throw new Error('Installed app workspace variable does not match the approved workspace');
  }
  const triggers = (application.logicFunctions ?? []).filter(
    (logicFunction) => logicFunction.universalIdentifier === TRIGGER_ID,
  );
  const settings = parseTriggerSettings(triggers[0]?.databaseEventTriggerSettings);
  if (triggers.length !== 1 || settings?.eventName !== 'workspaceMember.created') {
    throw new Error('Corgi CRM member-created database trigger is not active');
  }
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
  return fullName || normalizeEmail(member.userEmail).split('@')[0] || 'Wholesaler';
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
      throw new Error(`Workspace member ${member.id} has ${matches.length} identities`);
    }
    const wholesaler = matches[0];
    if (
      wholesaler.workspaceMemberId !== member.id ||
      normalizeEmail(wholesaler.email ?? '') !== email ||
      normalizeNamePart(wholesaler.name) !== expectedName(member) ||
      !wholesaler.role?.trim()
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
    throw new Error(`${orphanCount} identities link to absent workspace members`);
  }
  return { members: usableMembers.length, wholesalers: wholesalers.length };
};

const main = async () => {
  const mode = process.argv[2];
  if (mode !== 'target' && mode !== 'installed') {
    throw new Error('Usage: verify-production-install.mjs <target|installed>');
  }
  const origin = new URL(requiredEnvironment('CORGI_CRM_API_URL')).origin;
  const workspaceId = requiredEnvironment('CORGI_CRM_EXPECTED_WORKSPACE_ID');
  if (origin !== APPROVED_ORIGIN || workspaceId !== APPROVED_WORKSPACE_ID) {
    throw new Error('Production origin or workspace ID is not approved');
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

  await verifyInstalledApplication({
    graphql,
    version: requiredEnvironment('CORGI_CRM_EXPECTED_VERSION'),
    workspaceId,
  });
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
      selection: 'id name email role workspaceMemberId',
    }),
  ]);
  const result = verifyReconciliation({ members, wholesalers });
  console.log(
    `Verified installed app, active trigger, and ${result.members} member identities across ${result.wholesalers} wholesalers.`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export { verifyReconciliation };
import { pathToFileURL } from 'node:url';
