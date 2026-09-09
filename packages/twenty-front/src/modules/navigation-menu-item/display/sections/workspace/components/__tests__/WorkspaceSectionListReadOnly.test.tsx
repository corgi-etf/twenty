import { render, screen } from '@testing-library/react';
import { NavigationMenuItemType } from 'twenty-shared/types';

import { WorkspaceSectionListReadOnly } from '@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionListReadOnly';
import type { NavigationMenuItem } from '~/generated-metadata/graphql';

jest.mock(
  '@/navigation-menu-item/display/components/NavigationMenuItemDisplay',
  () => ({
    NavigationMenuItemDisplay: ({ item }: { item: NavigationMenuItem }) => (
      <div data-testid="workspace-navigation-item">{item.name}</div>
    ),
  }),
);
jest.mock('@/wholesaler-map/components/WholesalerMapNavigationItem', () => ({
  WholesalerMapNavigationItem: () => (
    <div data-testid="workspace-navigation-item">Territory map</div>
  ),
}));

describe('WorkspaceSectionListReadOnly', () => {
  it('renders the territory map after the dynamic workspace navigation items', () => {
    const filteredItems = [
      {
        id: 'companies',
        name: 'Companies',
        type: NavigationMenuItemType.OBJECT,
      },
      {
        id: 'people',
        name: 'People',
        type: NavigationMenuItemType.OBJECT,
      },
    ] as NavigationMenuItem[];

    render(
      <WorkspaceSectionListReadOnly
        filteredItems={filteredItems}
        folderChildrenById={new Map()}
      />,
    );

    expect(
      screen
        .getAllByTestId('workspace-navigation-item')
        .map((item) => item.textContent),
    ).toEqual(['Companies', 'People', 'Territory map']);
  });
});
