import { createHash } from 'node:crypto';
import { defineLogicFunction } from 'twenty-sdk/define';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreActivityNameRepository } from 'src/modules/outreach/graphql/core-activity-name.repository';
import {
  formatActivityName,
  isBlankActivityName,
} from 'src/modules/outreach/services/activity-name.service';
import { CoreLifecycleRepository } from 'src/modules/experience/graphql/core-lifecycle.repository';
import { allocationValidation } from 'src/modules/experience/services/reconcile-lifecycle.service';

export const EXPERIENCE_BACKFILL_FUNCTION_ID =
  '40590631-e998-5a8b-a194-d8a7ec40fb5a';
type Operation = {
  object: 'outreachActivity' | 'companyAllocation';
  id: string;
  expectedUpdatedAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};
type Manifest = {
  version: number;
  workspaceId: string;
  previewedAt: string;
  operations: Operation[];
  unresolved: unknown[];
  digest: string;
};
type Payload = { manifest: Manifest; index: number };

export const executeExperienceBackfill = async (
  payload: Payload,
  context: Pick<LogicFunctionExecutionContext, 'workspaceId'> | undefined,
  dependencies: {
    workspaceId: string | undefined;
    approvedDigest: string | undefined;
    activities: Pick<CoreActivityNameRepository, 'get' | 'update'>;
    lifecycle: Pick<CoreLifecycleRepository, 'get' | 'update'>;
  },
) => {
  const manifest = payload?.manifest;
  const approved = dependencies.approvedDigest;
  if (
    !approved ||
    !/^[a-f0-9]{64}$/.test(approved) ||
    !manifest ||
    context?.workspaceId !== dependencies.workspaceId ||
    manifest.workspaceId !== dependencies.workspaceId ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.operations) ||
    !Number.isInteger(payload.index) ||
    payload.index < 0 ||
    payload.index >= manifest.operations.length
  )
    throw new Error(
      'Backfill is not approved for this workspace and operation',
    );
  const { digest, ...body } = manifest;
  if (
    digest !== approved ||
    createHash('sha256').update(JSON.stringify(body)).digest('hex') !== approved
  )
    throw new Error('Backfill manifest differs from the approved digest');
  const operation = manifest.operations[payload.index]!;
  if (operation.object === 'outreachActivity') {
    const record = await dependencies.activities.get(operation.id);
    if (!record) return { status: 'missing', id: operation.id };
    const desired = formatActivityName({
      ...record,
      companyName:
        record.companyName ||
        (!record.companyId ? record.contactCompanyName : null),
    });
    if (
      Object.keys(operation.after).join() !== 'name' ||
      operation.after.name !== desired
    )
      throw new Error('Backfill title differs from current source facts');
    if (record.name === desired)
      return { status: 'unchanged', id: operation.id };
    if (
      !isBlankActivityName(record.name) ||
      record.name !== operation.before.name ||
      record.updatedAt !== operation.expectedUpdatedAt
    )
      return { status: 'conflict', id: operation.id };
    if (
      !(await dependencies.activities.update({
        id: record.id,
        expectedUpdatedAt: record.updatedAt,
        name: desired,
        managedName: desired,
      }))
    )
      return { status: 'conflict', id: operation.id };
    const saved = await dependencies.activities.get(record.id);
    return {
      status: 'updated',
      id: record.id,
      journal: {
        object: operation.object,
        id: record.id,
        before: { name: record.name, managedName: record.managedName },
        after: { name: desired, managedName: desired },
        expectedUpdatedAt: record.updatedAt,
        savedUpdatedAt: saved?.updatedAt,
      },
    };
  }
  if (operation.object !== 'companyAllocation')
    throw new Error('Unsupported backfill object');
  const record = await dependencies.lifecycle.get(
    'companyAllocation',
    operation.id,
  );
  if (!record) return { status: 'missing', id: operation.id };
  if (
    Object.keys(operation.after).join() !== 'loggedAt' ||
    operation.before.loggedAt !== null ||
    !record.createdAt ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    operation.after.loggedAt !== new Date(record.createdAt).toISOString() ||
    allocationValidation(record)
  )
    throw new Error(
      'Historical allocation is not eligible for the reviewed logging fallback',
    );
  if (record.loggedAt === operation.after.loggedAt)
    return { status: 'unchanged', id: record.id };
  if (record.loggedAt || record.updatedAt !== operation.expectedUpdatedAt)
    return { status: 'conflict', id: record.id };
  if (
    !(await dependencies.lifecycle.update('companyAllocation', record, {
      loggedAt: operation.after.loggedAt,
    }))
  )
    return { status: 'conflict', id: record.id };
  const saved = await dependencies.lifecycle.get(
    'companyAllocation',
    record.id,
  );
  return {
    status: 'updated',
    id: record.id,
    journal: {
      object: operation.object,
      id: record.id,
      before: operation.before,
      after: operation.after,
      expectedUpdatedAt: record.updatedAt,
      savedUpdatedAt: saved?.updatedAt,
    },
  };
};
export const handler = (
  payload: Payload,
  context?: LogicFunctionExecutionContext,
) => {
  const transport = new RawCoreGraphqlTransport();
  return executeExperienceBackfill(payload, context, {
    workspaceId: process.env.CORGI_CRM_WORKSPACE_ID,
    approvedDigest: process.env.CORGI_CRM_EXPERIENCE_BACKFILL_DIGEST,
    activities: new CoreActivityNameRepository(transport),
    lifecycle: new CoreLifecycleRepository(transport),
  });
};
export default defineLogicFunction({
  universalIdentifier: EXPERIENCE_BACKFILL_FUNCTION_ID,
  name: 'execute-experience-backfill',
  description:
    'Executes one CAS-fenced operation from an explicitly approved backfill manifest using the owning application identity.',
  timeoutSeconds: 30,
  handler,
});
