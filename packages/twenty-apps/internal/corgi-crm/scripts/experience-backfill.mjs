import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { formatActivityName } from '../../../../corgi-crm-activity-import/src/activity-name.ts';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instant = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const selections = {
  outreachActivity:
    'id name activityType occurredAt createdAt updatedAt companyId company {name} contact {company {id name}}',
  companyAllocation:
    'id ticker amount {amountMicros currencyCode} companyId contactId contact {companyId} meetingId meeting {companyId} loggedAt createdAt updatedAt allocationValidationMessage',
};
const plural = (object) =>
  object === 'outreachActivity' ? 'outreachActivities' : 'companyAllocations';

export const buildExperienceBackfill = ({
  activities,
  allocations,
  workspaceId,
  now = new Date().toISOString(),
}) => {
  if (!UUID.test(workspaceId) || !instant(now))
    throw new Error('Workspace and preview timestamp are required');
  const operations = [];
  const unresolved = [];
  const seen = new Set();
  for (const record of activities) {
    if (record.name?.trim() && record.name.trim().toLowerCase() !== 'untitled')
      continue;
    if (!UUID.test(record.id) || !instant(record.updatedAt)) {
      unresolved.push({
        object: 'outreachActivity',
        id: record.id,
        reason: 'Invalid record identity or update timestamp',
      });
      continue;
    }
    const key = `outreachActivity:${record.id}`;
    if (seen.has(key))
      throw new Error('Duplicate activity in backfill snapshot');
    seen.add(key);
    const companyName =
      record.company?.name ||
      (!record.companyId ? record.contact?.company?.name : null);
    operations.push({
      object: 'outreachActivity',
      id: record.id,
      expectedUpdatedAt: record.updatedAt,
      before: { name: record.name ?? null },
      after: { name: formatActivityName({ ...record, companyName }) },
      evidence: {
        activityType: record.activityType ?? null,
        companyId: record.companyId ?? null,
        companyName: companyName ?? null,
        occurredAt: record.occurredAt ?? null,
        createdAt: record.createdAt ?? null,
      },
    });
  }
  for (const record of allocations) {
    if (record.loggedAt) continue;
    const rawAmount = record.amount?.amountMicros;
    const validAmount =
      typeof rawAmount === 'number'
        ? Number.isSafeInteger(rawAmount) && rawAmount > 0
        : typeof rawAmount === 'string' &&
          /^\d+$/.test(rawAmount) &&
          BigInt(rawAmount) > BigInt(0);
    const valid =
      UUID.test(record.id) &&
      UUID.test(record.companyId ?? '') &&
      record.ticker?.trim() &&
      validAmount &&
      /^[A-Z]{3}$/.test(record.amount?.currencyCode ?? '') &&
      (!record.contactId || record.contact?.companyId === record.companyId) &&
      (!record.meetingId || record.meeting?.companyId === record.companyId) &&
      !record.allocationValidationMessage &&
      instant(record.createdAt) &&
      instant(record.updatedAt) &&
      Date.parse(record.createdAt) <= Date.parse(now);
    if (!valid) {
      unresolved.push({
        object: 'companyAllocation',
        id: record.id,
        reason:
          'Incomplete allocation, inconsistent links, or untrustworthy creation timestamp',
      });
      continue;
    }
    const key = `companyAllocation:${record.id}`;
    if (seen.has(key))
      throw new Error('Duplicate allocation in backfill snapshot');
    seen.add(key);
    operations.push({
      object: 'companyAllocation',
      id: record.id,
      expectedUpdatedAt: record.updatedAt,
      before: { loggedAt: null },
      after: { loggedAt: new Date(record.createdAt).toISOString() },
      evidence: {
        basis:
          'Historical valid allocation: original CRM createdAt is the documented loggedAt fallback',
        createdAt: record.createdAt,
        companyId: record.companyId,
        ticker: record.ticker,
        amount: record.amount,
      },
    });
  }
  operations.sort(
    (left, right) =>
      left.object.localeCompare(right.object) ||
      left.id.localeCompare(right.id),
  );
  const body = {
    version: 1,
    workspaceId,
    previewedAt: now,
    operations,
    unresolved,
  };
  return { ...body, digest: digest(body) };
};

export const validateBackfillManifest = (
  manifest,
  expectedWorkspaceId,
  approvedDigest,
) => {
  const { digest: actualDigest, ...body } = manifest;
  if (
    manifest.version !== 1 ||
    manifest.workspaceId !== expectedWorkspaceId ||
    actualDigest !== digest(body) ||
    approvedDigest !== actualDigest
  )
    throw new Error(
      'Backfill workspace or approved manifest digest does not match',
    );
  for (const operation of manifest.operations) {
    const field =
      operation.object === 'outreachActivity'
        ? 'name'
        : operation.object === 'companyAllocation'
          ? 'loggedAt'
          : null;
    if (
      !field ||
      !UUID.test(operation.id) ||
      !instant(operation.expectedUpdatedAt) ||
      Object.keys(operation.before).join() !== field ||
      Object.keys(operation.after).join() !== field
    )
      throw new Error('Backfill contains an unsupported mutation');
    if (
      field === 'name' &&
      (typeof operation.after.name !== 'string' || !operation.after.name.trim())
    )
      throw new Error('Backfill title is invalid');
    if (
      field === 'loggedAt' &&
      (!instant(operation.after.loggedAt) || operation.before.loggedAt !== null)
    )
      throw new Error('Backfill logging timestamp is invalid');
  }
};

export const createExperienceBackfillRepository = ({ url, token, graphql }) => {
  const request = async (document, variables, endpoint = '/graphql') => {
    if (graphql) return graphql(document, variables, endpoint);
    const response = await fetch(`${url.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length || !result.data)
      throw new Error(
        `CRM request failed (${response.status}); no further mutations attempted`,
      );
    return result.data;
  };
  return {
    async list(object) {
      const records = [];
      const cursors = new Set();
      let after = null;
      for (let page = 0; page < 1000; page++) {
        const data = await request(
          `query BackfillSnapshot($after:String){${plural(object)}(first:100,after:$after){edges{node{${selections[object]}}}pageInfo{hasNextPage endCursor}}}`,
          { after },
        );
        const connection = data[plural(object)];
        if (!Array.isArray(connection?.edges))
          throw new Error('Invalid backfill snapshot');
        records.push(...connection.edges.map((edge) => edge.node));
        if (!connection.pageInfo.hasNextPage) return records;
        after = connection.pageInfo.endCursor;
        if (!after || cursors.has(after))
          throw new Error('Unstable backfill pagination');
        cursors.add(after);
      }
      throw new Error('Backfill snapshot exceeded the bounded page limit');
    },
    async resolveBackfillFunction(workspaceId) {
      const data = await request(
        `query BackfillIdentity {currentWorkspace{id} findManyApplications{id universalIdentifier} findOneApplication(universalIdentifier:"ca87ad48-b62a-41be-a790-7c17707ff1b4"){applicationVariables{key value}} findManyLogicFunctions{id universalIdentifier applicationId name databaseEventTriggerSettings httpRouteTriggerSettings cronTriggerSettings toolTriggerSettings workflowActionTriggerSettings}}`,
        {},
        '/metadata',
      );
      const apps = data.findManyApplications.filter(
        (row) =>
          row.universalIdentifier === 'ca87ad48-b62a-41be-a790-7c17707ff1b4',
      );
      const functions = data.findManyLogicFunctions.filter(
        (row) =>
          row.universalIdentifier === '40590631-e998-5a8b-a194-d8a7ec40fb5a',
      );
      if (
        data.currentWorkspace?.id !== workspaceId ||
        apps.length !== 1 ||
        functions.length !== 1 ||
        functions[0].applicationId !== apps[0].id ||
        functions[0].name !== 'execute-experience-backfill' ||
        [
          'databaseEventTriggerSettings',
          'httpRouteTriggerSettings',
          'cronTriggerSettings',
          'toolTriggerSettings',
          'workflowActionTriggerSettings',
        ].some((key) => functions[0][key] != null)
      )
        throw new Error(
          'Installed backfill function identity or workspace does not match',
        );
      const activeDigest = data.findOneApplication?.applicationVariables?.find(
        (row) => row.key === 'CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST',
      )?.value;
      if (activeDigest === undefined)
        throw new Error('Backfill approval variable is not installed');
      return {
        functionId: functions[0].id,
        applicationId: apps[0].id,
        activeDigest,
      };
    },
    async approve(applicationId, value) {
      const data = await request(
        `mutation ApproveBackfill($applicationId:UUID!,$key:String!,$value:String!){updateOneApplicationVariable(applicationId:$applicationId,key:$key,value:$value)}`,
        { applicationId, key: 'CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST', value },
        '/metadata',
      );
      if (data.updateOneApplicationVariable !== true)
        throw new Error('Backfill approval variable update was not confirmed');
    },
    async execute(id, manifest, index) {
      const data = await request(
        `mutation ExecuteBackfill($input:ExecuteOneLogicFunctionInput!){executeOneLogicFunction(input:$input){status data}}`,
        { input: { id, payload: { manifest, index } } },
        '/metadata',
      );
      const execution = data.executeOneLogicFunction;
      if (execution?.status !== 'SUCCESS' || !execution.data?.status)
        throw new Error(
          'Owning-application backfill operation failed; inspect the journal and approved digest',
        );
      return execution.data;
    },
  };
};

const main = async () => {
  const [mode, manifestPath, journalPath, approvedDigest] =
    process.argv.slice(2);
  if (
    !['preview', 'apply'].includes(mode) ||
    !manifestPath ||
    (mode === 'apply' && (!journalPath || !approvedDigest))
  )
    throw new Error(
      'Usage: node scripts/experience-backfill.mjs preview MANIFEST | apply MANIFEST JOURNAL APPROVED_DIGEST',
    );
  const workspaceId = process.env.CORGI_CRM_WORKSPACE_ID;
  const url = process.env.CORGI_CRM_URL;
  const token =
    process.env.CORGI_CRM_ACCESS_TOKEN ||
    (mode === 'preview' ? process.env.CORGI_CRM_API_KEY : undefined);
  if (!UUID.test(workspaceId ?? '') || !url || !token)
    throw new Error(
      'Set CORGI_CRM_WORKSPACE_ID, CORGI_CRM_URL, and CORGI_CRM_ACCESS_TOKEN (preview also accepts CORGI_CRM_API_KEY)',
    );
  const repository = createExperienceBackfillRepository({ url, token });
  if (mode === 'preview') {
    const activities = await repository.list('outreachActivity');
    const allocations = await repository.list('companyAllocation');
    const manifest = buildExperienceBackfill({
      activities,
      allocations,
      workspaceId,
    });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        mode,
        operations: manifest.operations.length,
        unresolved: manifest.unresolved.length,
        digest: manifest.digest,
      }),
    );
    return;
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateBackfillManifest(manifest, workspaceId, approvedDigest);
  const { functionId, applicationId, activeDigest } =
    await repository.resolveBackfillFunction(workspaceId);
  const results = [];
  if (activeDigest && activeDigest !== approvedDigest)
    throw new Error(
      'A different backfill manifest is approved; review it before replacing the approval',
    );
  try {
    await repository.approve(applicationId, approvedDigest);
    for (let index = 0; index < manifest.operations.length; index++) {
      await appendFile(
        journalPath,
        JSON.stringify({
          status: 'intent',
          digest: manifest.digest,
          index,
          operation: manifest.operations[index],
        }) + '\n',
        { mode: 0o600 },
      );
      const result = await repository.execute(functionId, manifest, index);
      await appendFile(
        journalPath,
        JSON.stringify({ digest: manifest.digest, index, ...result }) + '\n',
        { mode: 0o600 },
      );
      results.push(result);
    }
  } finally {
    await repository.approve(applicationId, '');
  }
  console.log(
    JSON.stringify({
      mode,
      updated: results.filter((row) => row.status === 'updated').length,
      conflicts: results.filter((row) => row.status === 'conflict').length,
      unchanged: results.filter((row) => row.status === 'unchanged').length,
    }),
  );
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
