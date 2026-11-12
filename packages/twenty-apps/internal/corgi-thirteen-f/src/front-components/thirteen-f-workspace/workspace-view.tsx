import { formatCount } from 'src/front-components/thirteen-f-workspace/format';
import { WorkspaceContent } from 'src/front-components/thirteen-f-workspace/workspace-content';
import type { ThirteenFWorkspaceController } from 'src/front-components/thirteen-f-workspace/workspace-controller';
import { WorkspaceHeader } from 'src/front-components/thirteen-f-workspace/workspace-header';
import { WORKSPACE_STYLES } from 'src/front-components/thirteen-f-workspace/workspace-styles';

type WorkspaceViewProps = { controller: ThirteenFWorkspaceController };

const LoadMoreButton = ({
  controller,
}: {
  controller: ThirteenFWorkspaceController;
}) => {
  const { pagination } = controller;
  if (!pagination?.pageInfo.hasNextPage) return null;

  return (
    <button
      type="button"
      style={WORKSPACE_STYLES.loadMore}
      disabled={controller.loadingMore}
      aria-busy={controller.loadingMore}
      onClick={controller.loadMore}
    >
      {controller.loadingMore
        ? 'Loading…'
        : `Load more · ${formatCount(
            pagination.visibleCount,
          )} of ${formatCount(pagination.totalCount)}`}
    </button>
  );
};

export const WorkspaceView = ({ controller }: WorkspaceViewProps) => (
  <main style={WORKSPACE_STYLES.page}>
    <div style={WORKSPACE_STYLES.content}>
      <WorkspaceHeader controller={controller} />
      {controller.loadMoreError ? (
        <div style={WORKSPACE_STYLES.error} role="alert">
          {controller.loadMoreError}
        </div>
      ) : null}
      <div
        style={{
          ...WORKSPACE_STYLES.panel,
          marginTop: controller.loadMoreError ? 12 : 0,
        }}
      >
        <WorkspaceContent controller={controller} />
        <LoadMoreButton controller={controller} />
      </div>
    </div>
  </main>
);
