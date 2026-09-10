import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type DatabaseEventPayload,
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { ON_WORKSPACE_MEMBER_CREATED_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';
import { reconcileWorkspaceMember } from 'src/modules/wholesaler/onboarding/services/reconcile-workspace-member.service';

type WorkspaceMemberCreated = {
  userEmail?: string | null;
  name?: { firstName?: string | null; lastName?: string | null } | null;
};

export const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<WorkspaceMemberCreated>>,
) => {
  const after = payload.properties.after;
  if (!payload.recordId || !after?.userEmail) {
    return { status: 'skipped', reason: 'missing_identity' };
  }

  const client = new CoreApiClient();
  return reconcileWorkspaceMember({
    eventWorkspaceId: payload.workspaceId,
    targetWorkspaceId: process.env.CORGI_CRM_WORKSPACE_ID ?? '',
    member: {
      id: payload.recordId,
      email: after.userEmail,
      firstName: after.name?.firstName,
      lastName: after.name?.lastName,
    },
    repository: new CoreWholesalerRepository(client, new RawCoreGraphqlTransport()),
  });
};

export default defineLogicFunction({
  universalIdentifier: ON_WORKSPACE_MEMBER_CREATED_UNIVERSAL_IDENTIFIER,
  name: 'on-workspace-member-created',
  description:
    'Idempotently links or creates the Wholesaler for a new workspace member.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: { eventName: 'workspaceMember.created' },
});
