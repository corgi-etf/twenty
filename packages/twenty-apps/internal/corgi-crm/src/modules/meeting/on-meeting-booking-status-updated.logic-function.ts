import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type DatabaseEventPayload,
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { CoreMeetingBookingRepository } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import {
  MEETING_BOOKING_STATUS,
  MEETING_BOOKING_STATUS_UPDATED_FUNCTION_UNIVERSAL_IDENTIFIER,
} from 'src/modules/meeting/meeting-identifiers';
import { reconcileMeetingBooking } from 'src/modules/meeting/services/reconcile-meeting-booking.service';

type MeetingBookingEventRecord = {
  id?: string | null;
  updatedAt?: string | null;
  updatedBy?: { workspaceMemberId?: string | null } | null;
  status?: string | null;
};

export const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordUpdateEvent<MeetingBookingEventRecord>
  >,
) => {
  if (
    !process.env.CORGI_CRM_WORKSPACE_ID ||
    payload.workspaceId !== process.env.CORGI_CRM_WORKSPACE_ID
  ) {
    return { status: 'skipped', reason: 'workspace_mismatch' } as const;
  }
  const after = payload.properties.after;
  const meetingId = payload.recordId ?? after?.id;
  if (
    !meetingId ||
    !after?.updatedAt ||
    after.status !== MEETING_BOOKING_STATUS.BOOKED
  ) {
    return { status: 'skipped', reason: 'missing_event_identity' } as const;
  }
  return reconcileMeetingBooking({
    meetingId,
    eventOccurredAt: after.updatedAt,
    actorWorkspaceMemberId: after.updatedBy?.workspaceMemberId ?? null,
    repository: new CoreMeetingBookingRepository(new CoreApiClient()),
  });
};

export default defineLogicFunction({
  universalIdentifier:
    MEETING_BOOKING_STATUS_UPDATED_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'on-meeting-booking-status-updated',
  description:
    'Validates the draft-to-booked transition and atomically stamps first-booked evidence.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'meetingBooking.updated',
    updatedFields: ['status'],
  },
});
