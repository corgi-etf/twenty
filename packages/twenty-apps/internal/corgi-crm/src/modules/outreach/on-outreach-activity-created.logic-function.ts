import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type DatabaseEventPayload,
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import { OUTREACH_ACTIVITY_CREATED_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/modules/outreach/outreach-identifiers';
import { CoreFollowUpTaskRepository } from 'src/modules/outreach/graphql/core-follow-up-task.repository';
import { assignOutreachActivityOwner } from 'src/modules/outreach/services/assign-outreach-activity-owner.service';
import { createFollowUpTask } from 'src/modules/outreach/services/create-follow-up-task.service';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

type OutreachActivityEventRecord = {
  id?: string | null;
  wholesalerId?: string | null;
  createdBy?: { workspaceMemberId?: string | null } | null;
};

export const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordCreateEvent<OutreachActivityEventRecord>
  >,
) => {
  if (
    !process.env.CORGI_CRM_WORKSPACE_ID ||
    payload.workspaceId !== process.env.CORGI_CRM_WORKSPACE_ID
  ) {
    return { status: 'skipped', reason: 'workspace_mismatch' } as const;
  }
  const after = payload.properties.after;
  const activityId = payload.recordId ?? after?.id;
  if (!activityId) {
    return { status: 'skipped', reason: 'missing_event_identity' } as const;
  }
  // Saves a Core round trip for the common already-owned create. Correctness
  // does not rest on it: the service re-reads the live owner and its write
  // filters on a still-empty one, so an absent event field only costs a read.
  // createdBy is the record's own attribution and survives re-delivery; the
  // event actor only fills in when the create predates that stamp.
  const creatorWorkspaceMemberId =
    after?.createdBy?.workspaceMemberId ?? payload.workspaceMemberId ?? null;
  try {
    const client = new CoreApiClient();
    const transport = new RawCoreGraphqlTransport();
    // Owner assignment is skipped for an activity that already has one, but
    // the follow-up task is not: almost every activity is logged with an
    // owner, so gating the task on that would skip it on exactly the records
    // that need it.
    const ownership = after?.wholesalerId
      ? ({ status: 'skipped', reason: 'already_assigned' } as const)
      : await assignOutreachActivityOwner({
          activityId,
          creatorWorkspaceMemberId,
          activityRepository: new CoreOutreachRepository(client, transport),
          wholesalerRepository: new CoreWholesalerRepository(client, transport),
        });
    const followUp = await createFollowUpTask({
      activityId,
      repository: new CoreFollowUpTaskRepository(transport),
    });
    return { status: 'handled', ownership, followUp } as const;
  } catch {
    throw new RetryableLogicFunctionError(
      'Outreach activity owner assignment did not complete',
    );
  }
};

export default defineLogicFunction({
  universalIdentifier: OUTREACH_ACTIVITY_CREATED_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'on-outreach-activity-created',
  description:
    'Assigns a new outreach activity to the wholesaler of the workspace member who created it, never replacing an explicitly chosen owner, and raises its follow-up task when one is due.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'outreachActivity.created' },
});
