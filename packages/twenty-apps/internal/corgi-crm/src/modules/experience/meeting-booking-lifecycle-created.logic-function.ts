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
) => handleLifecycleEvent('meetingBooking', payload);
export default defineLogicFunction({
  universalIdentifier: '7b76e023-90b4-5e74-8ee0-827aab679efd',
  name: 'meeting-booking-lifecycle-created',
  description:
    'Validates meaningful records and stamps first lifecycle evidence without replaying it on edits.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'meetingBooking.created' },
});
