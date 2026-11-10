import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PageLayoutTabResolver } from 'src/engine/metadata-modules/page-layout-tab/resolvers/page-layout-tab.resolver';

describe('PageLayoutTabResolver', () => {
  it('emits resolvable workspace decorator metadata', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        PageLayoutTabResolver.prototype,
        'getPageLayoutTabs',
      ),
    ).toEqual([WorkspaceEntity, String]);
  });
});
