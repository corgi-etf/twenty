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
import { assignOutreachActivityOwner } from 'src/modules/outreach/services/assign-outreach-activity-owner.service';
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
  if (after?.wholesalerId) {
    return { status: 'skipped', reason: 'already_assigned' } as const;
  }
  // createdBy is the record's own attribution and survives re-delivery; the
  // event actor only fills in when the create predates that stamp.
  const creatorWorkspaceMemberId =
    after?.createdBy?.workspaceMemberId ?? payload.workspaceMemberId ?? null;
  try {
    const client = new CoreApiClient();
    const transport = new RawCoreGraphqlTransport();
    return await assignOutreachActivityOwner({
      activityId,
      creatorWorkspaceMemberId,
      activityRepository: new CoreOutreachRepository(client, transport),
      wholesalerRepository: new CoreWholesalerRepository(client, transport),
    });
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
    'Assigns a new outreach activity to the wholesaler of the workspace member who created it, and never replaces an explicitly chosen owner.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'outreachActivity.created' },
});
