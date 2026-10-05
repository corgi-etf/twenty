import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { handleLifecycleEvent } from 'src/modules/experience/lifecycle-event.handler';
export const handler = (
  payload: DatabaseEventPayload<
    ObjectRecordCreateEvent<{
      id?: string;
      updatedAt?: string;
      updatedBy?: { workspaceMemberId?: string | null } | null;
    }>
  >,
) => handleLifecycleEvent('companyAllocation', payload);
export default defineLogicFunction({
  universalIdentifier: 'cb84f713-50d0-5f57-be7e-ebe485f65b2e',
  name: 'company-allocation-lifecycle-created',
  description:
    'Validates meaningful records and stamps first lifecycle evidence without replaying it on edits.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'companyAllocation.created' },
});
