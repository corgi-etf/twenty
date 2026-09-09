import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type InstallPayload,
  definePostInstallLogicFunction,
} from 'twenty-sdk/define';

import { POST_INSTALL_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';
import { reconcileAllWorkspaceMembers } from 'src/modules/wholesaler/onboarding/services/reconcile-all-workspace-members.service';

export const handler = async (_payload: InstallPayload) => {
  const workspaceId = process.env.CORGI_CRM_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    throw new Error(
      'CORGI_CRM_WORKSPACE_ID must be configured before wholesaler backfill',
    );
  }

  const result = await reconcileAllWorkspaceMembers({
    workspaceId,
    repository: new CoreWholesalerRepository(new CoreApiClient()),
  });
  if (result.failures.length > 0) {
    throw new Error(
      `Wholesaler reconciliation failed closed for ${result.failures.length} workspace member(s): ${result.failures
        .map(({ memberId }) => memberId)
        .join(', ')}`,
    );
  }
  return result;
};

export default definePostInstallLogicFunction({
  universalIdentifier: POST_INSTALL_UNIVERSAL_IDENTIFIER,
  name: 'reconcile-existing-workspace-members',
  description:
    'Backfills one Wholesaler identity per existing workspace member on install.',
  timeoutSeconds: 300,
  handler,
  shouldRunOnVersionUpgrade: true,
  shouldRunSynchronously: true,
});
