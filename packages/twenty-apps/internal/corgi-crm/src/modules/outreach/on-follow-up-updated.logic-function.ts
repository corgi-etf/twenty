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
    ).synchronizeReminder(id);
    return { status: 'synchronized' };
  } catch {
    throw new RetryableLogicFunctionError(
      'Follow-up reminder synchronization did not complete',
    );
  }
};
export default defineLogicFunction({
  universalIdentifier: '25564e34-c66b-5cb6-a446-fd1b91d84b4e',
  name: 'on-follow-up-updated',
  description:
    'Updates the reminder after completion, reassignment or rescheduling without changing scheduler history.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'outreachFollowUp.updated',
    updatedFields: [
      'status',
      'dueAt',
      'assigneeId',
      'wholesalerId',
      'companyId',
      'name',
    ],
  },
});
