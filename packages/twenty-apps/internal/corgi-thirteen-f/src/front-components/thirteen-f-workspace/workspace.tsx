import { useThirteenFWorkspaceController } from 'src/front-components/thirteen-f-workspace/workspace-controller';
import { WorkspaceView } from 'src/front-components/thirteen-f-workspace/workspace-view';

export const ThirteenFWorkspace = () => {
  const controller = useThirteenFWorkspaceController();

  return <WorkspaceView controller={controller} />;
};
