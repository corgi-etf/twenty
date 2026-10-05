import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreFollowUpRepository } from 'src/modules/outreach/graphql/core-follow-up.repository';
export const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<{ id?: string }>>,
) => {
  if (
    !process.env.CORGI_CRM_WORKSPACE_ID ||
    payload.workspaceId !== process.env.CORGI_CRM_WORKSPACE_ID
  )
    return { status: 'skipped' };
  const id = payload.recordId ?? payload.properties.after?.id;
  if (!id) return { status: 'skipped' };
  try {
    await new CoreFollowUpRepository(
      new RawCoreGraphqlTransport(),
    ).synchronizeTaskStatus(id);
    return { status: 'synchronized' };
  } catch {
    throw new RetryableLogicFunctionError(
      'Task follow-up status synchronization did not complete',
    );
  }
};
export default defineLogicFunction({
  universalIdentifier: '59cfeabc-04c7-5c3a-842e-f6c752b160ec',
  name: 'on-follow-up-task-updated',
  description:
    'Keeps follow-up company history aligned when users complete or reopen a reminder task.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'task.updated',
    updatedFields: ['status'],
  },
});
