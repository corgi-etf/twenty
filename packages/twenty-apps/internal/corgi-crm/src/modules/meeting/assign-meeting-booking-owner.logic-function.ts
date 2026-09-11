import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type DatabaseEventPayload,
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import { CoreMeetingBookingRepository } from 'src/modules/meeting/graphql/core-meeting-booking.repository';
import { MEETING_BOOKING_OWNER_ASSIGNMENT_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/modules/meeting/meeting-identifiers';
import { assignMeetingBookingOwner } from 'src/modules/meeting/services/assign-meeting-booking-owner.service';

type MeetingBookingEventRecord = {
  id?: string | null;
  wholesalerId?: string | null;
  createdBy?: { workspaceMemberId?: string | null } | null;
};

export const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordCreateEvent<MeetingBookingEventRecord>
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
  if (!meetingId) {
    return { status: 'skipped', reason: 'missing_event_identity' } as const;
  }
  // Saves a Core round trip for the common already-owned create. Correctness
  // does not rest on it: the service re-reads the live owner and its write
  // filters on a still-empty one, so an absent event field only costs a read.
  // Deliberately not short-circuiting on an existing owner: every real
  // meeting is created with one, so doing that would skip the booked-by
  // claim on exactly the records that need it.
  // createdBy is the record's own attribution and survives re-delivery; the
  // event actor only fills in when the create predates that stamp.
  const creatorWorkspaceMemberId =
    after?.createdBy?.workspaceMemberId ?? payload.workspaceMemberId ?? null;
  try {
    const client = new CoreApiClient();
    return await assignMeetingBookingOwner({
      meetingId,
      creatorWorkspaceMemberId,
      meetingRepository: new CoreMeetingBookingRepository(client),
    });
  } catch {
    throw new RetryableLogicFunctionError(
      'Meeting booking owner assignment did not complete',
    );
  }
};

export default defineLogicFunction({
  universalIdentifier:
    MEETING_BOOKING_OWNER_ASSIGNMENT_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'assign-meeting-booking-owner',
  description:
    'Assigns a new meeting booking to the wholesaler of the workspace member who created it, and never replaces an explicitly chosen owner.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'meetingBooking.created' },
});
