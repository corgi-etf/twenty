import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreActivityNameRepository } from 'src/modules/outreach/graphql/core-activity-name.repository';
import { CoreFollowUpRepository } from 'src/modules/outreach/graphql/core-follow-up.repository';
import { reconcileActivityName } from 'src/modules/outreach/services/activity-name.service';
import { reconcileFollowUp } from 'src/modules/outreach/services/reconcile-follow-up.service';

type ActivityEvent = {
  id?: string;
  updatedAt?: string;
  updatedBy?: { workspaceMemberId?: string | null } | null;
  followUpDate?: string | null;
  followUpRequestKey?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  notes?: string | null;
};
export const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<ActivityEvent>>,
) => {
  if (
    !process.env.CORGI_CRM_WORKSPACE_ID ||
    payload.workspaceId !== process.env.CORGI_CRM_WORKSPACE_ID
  )
    return { status: 'skipped', reason: 'workspace_mismatch' } as const;
  const after = payload.properties.after;
  const before = payload.properties.before;
  const activityId = payload.recordId ?? after?.id;
  if (!activityId)
    return { status: 'skipped', reason: 'missing_event_identity' } as const;
  try {
    const transport = new RawCoreGraphqlTransport();
    const naming = await reconcileActivityName(
      activityId,
      new CoreActivityNameRepository(transport),
    );
    const changed =
      before &&
      after &&
      [
        'followUpDate',
        'followUpRequestKey',
        'companyId',
        'contactId',
        'notes',
      ].some(
        (field) =>
          before[field as keyof ActivityEvent] !==
          after[field as keyof ActivityEvent],
      );
    const followUp = changed
      ? await reconcileFollowUp({
          activityId,
          actorWorkspaceMemberId:
            payload.workspaceMemberId ??
            after?.updatedBy?.workspaceMemberId ??
            null,
          eventAt: after?.updatedAt ?? '',
          expectedRequestKey: after?.followUpRequestKey ?? null,
          expectedFollowUpDate: after?.followUpDate ?? null,
          allowCreate:
            before?.followUpDate !== after?.followUpDate ||
            before?.followUpRequestKey !== after?.followUpRequestKey,
          repository: new CoreFollowUpRepository(transport),
        })
      : { status: 'unchanged' };
    return { status: 'handled', naming, followUp };
  } catch {
    throw new RetryableLogicFunctionError(
      'Activity naming or follow-up reconciliation did not complete',
    );
  }
};
export default defineLogicFunction({
  universalIdentifier: '9bfb7c66-2510-5cbd-851e-279bbf382ff2',
  name: 'on-outreach-activity-updated',
  description:
    'Preserves custom titles and reconciles dated follow-up work with scheduler attribution.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'outreachActivity.updated' },
});
