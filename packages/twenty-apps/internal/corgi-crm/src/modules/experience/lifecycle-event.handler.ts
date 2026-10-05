import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreLifecycleRepository } from 'src/modules/experience/graphql/core-lifecycle.repository';
import {
  reconcileLifecycle,
  matchesLifecycleInputs,
  type LifecycleRecord,
} from 'src/modules/experience/services/reconcile-lifecycle.service';
export const handleLifecycleEvent = async (
  object: 'meetingBooking' | 'companyAllocation',
  payload: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    recordId?: string;
    properties: {
      before?: Partial<LifecycleRecord> | null;
      after?:
        | (Partial<LifecycleRecord> & {
            updatedBy?: { workspaceMemberId?: string | null } | null;
          })
        | null;
    };
  },
) => {
  if (
    !process.env.CORGI_CRM_WORKSPACE_ID ||
    payload.workspaceId !== process.env.CORGI_CRM_WORKSPACE_ID
  )
    return { status: 'skipped' };
  const after = payload.properties.after;
  const id = payload.recordId ?? after?.id;
  if (!id || !after?.updatedAt) return { status: 'skipped' };
  if (
    payload.properties.before &&
    matchesLifecycleInputs(object, payload.properties.before, after)
  )
    return { status: 'skipped', reason: 'no_input_change' };
  try {
    return await reconcileLifecycle({
      object,
      id,
      eventAt: after.updatedAt,
      eventSnapshot: after,
      actorWorkspaceMemberId:
        payload.workspaceMemberId ?? after.updatedBy?.workspaceMemberId ?? null,
      repository: new CoreLifecycleRepository(new RawCoreGraphqlTransport()),
    });
  } catch {
    throw new RetryableLogicFunctionError(
      'Lifecycle evidence reconciliation did not complete',
    );
  }
};
