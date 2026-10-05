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
) => handleLifecycleEvent('meetingBooking', payload);
export default defineLogicFunction({
  universalIdentifier: '40524308-346f-5358-9c46-8871c7936aa7',
  name: 'meeting-booking-lifecycle-updated',
  description:
    'Validates meaningful records and stamps first lifecycle evidence without replaying it on edits.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'meetingBooking.updated' },
});
