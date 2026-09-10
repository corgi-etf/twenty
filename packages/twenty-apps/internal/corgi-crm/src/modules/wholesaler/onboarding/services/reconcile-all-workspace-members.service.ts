import { reconcileWorkspaceMember } from 'src/modules/wholesaler/onboarding/services/reconcile-workspace-member.service';
import {
  asWholesalerReconciliationError,
  type WholesalerReconciliationCode,
  type WholesalerReconciliationStage,
} from 'src/modules/wholesaler/onboarding/services/wholesaler-reconciliation.error';
import { type WholesalerRepository } from 'src/modules/wholesaler/onboarding/types';

const MAX_MEMBER_PAGES = 100;

export type ReconcileAllResult = {
  created: number;
  updated: number;
  unchanged: number;
  failures: Array<{
    stage: WholesalerReconciliationStage;
    code: WholesalerReconciliationCode;
  }>;
};

export const reconcileAllWorkspaceMembers = async ({
  workspaceId,
  repository,
}: {
  workspaceId: string;
  repository: WholesalerRepository;
}): Promise<ReconcileAllResult> => {
  const result: ReconcileAllResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    failures: [],
  };
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  for (let pageNumber = 0; pageNumber < MAX_MEMBER_PAGES; pageNumber += 1) {
    const page = await repository.listWorkspaceMembers(cursor);
    for (const member of page.members) {
      try {
        const memberResult = await reconcileWorkspaceMember({
          eventWorkspaceId: workspaceId,
          targetWorkspaceId: workspaceId,
          member,
          repository,
        });
        if (memberResult.status === 'created') result.created += 1;
        if (memberResult.status === 'updated') result.updated += 1;
        if (memberResult.status === 'unchanged') result.unchanged += 1;
      } catch (error) {
        const diagnostic = asWholesalerReconciliationError(
          'lookup_member_relation',
          error,
        );
        result.failures.push({
          stage: diagnostic.stage,
          code: diagnostic.code,
        });
      }
    }

    if (!page.nextCursor) return result;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error('Workspace member pagination repeated a cursor');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(`Workspace member pagination exceeded ${MAX_MEMBER_PAGES} pages`);
};
