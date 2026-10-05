import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreLifecycleRepository } from 'src/modules/experience/graphql/core-lifecycle.repository';
import { reconcileLifecycle } from 'src/modules/experience/services/reconcile-lifecycle.service';
export const handleLifecycleEvent = async (
  object: 'meetingBooking' | 'companyAllocation',
  payload: {
    workspaceId: string;
    workspaceMemberId?: string | null;
    recordId?: string;
    properties: {
      after?: {
        id?: string;
        updatedAt?: string;
        updatedBy?: { workspaceMemberId?: string | null } | null;
      } | null;
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
  try {
    return await reconcileLifecycle({
      object,
      id,
      eventAt: after.updatedAt,
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
