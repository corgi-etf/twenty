import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  type InstallPayload,
  definePostInstallLogicFunction,
} from 'twenty-sdk/define';
import { type LogicFunctionExecutionContext } from 'twenty-sdk/logic-function';

import { POST_INSTALL_UNIVERSAL_IDENTIFIER } from 'src/constants';
import { RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';
import { reconcileAllWorkspaceMembers } from 'src/modules/wholesaler/onboarding/services/reconcile-all-workspace-members.service';

const summarizeFailures = (
  failures: Awaited<ReturnType<typeof reconcileAllWorkspaceMembers>>['failures'],
): string => {
  const counts = new Map<string, number>();
  for (const { stage, code } of failures) {
    const key = `${stage}/${code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
};

export const handler = async (
  _payload: InstallPayload,
  context?: LogicFunctionExecutionContext,
) => {
  const expectedWorkspaceId = process.env.CORGI_CRM_WORKSPACE_ID?.trim();
  if (!expectedWorkspaceId) {
    throw new Error(
      'CORGI_CRM_WORKSPACE_ID must be configured before wholesaler backfill',
    );
  }
  if (!context?.workspaceId) {
    throw new Error(
      'Post-install execution context must include the installation workspace ID',
    );
  }
  if (context.workspaceId !== expectedWorkspaceId) {
    throw new Error(
      `Corgi CRM post-install refused workspace ${context.workspaceId}; expected ${expectedWorkspaceId}`,
    );
  }

  const result = await reconcileAllWorkspaceMembers({
    workspaceId: context.workspaceId,
    repository: new CoreWholesalerRepository(
      new CoreApiClient(),
      new RawCoreGraphqlTransport(),
    ),
  });
  if (result.failures.length > 0) {
    throw new Error(
      `Wholesaler reconciliation failed closed for ${result.failures.length} workspace member(s): ${summarizeFailures(result.failures)}`,
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
