import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { handleLifecycleEvent } from 'src/modules/experience/lifecycle-event.handler';
export const handler = (
  payload: DatabaseEventPayload<
    ObjectRecordUpdateEvent<{
      id?: string;
      updatedAt?: string;
      updatedBy?: { workspaceMemberId?: string | null } | null;
    }>
  >,
) => handleLifecycleEvent('companyAllocation', payload);
export default defineLogicFunction({
  universalIdentifier: 'feb59567-ea13-5c52-a579-2e1c95cba702',
  name: 'company-allocation-lifecycle-updated',
  description:
    'Validates meaningful records and stamps first lifecycle evidence without replaying it on edits.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'companyAllocation.updated',
    updatedFields: ['companyId', 'contactId', 'meetingId', 'ticker', 'amount'],
  },
});
