import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { WholesalerMapNavigationItem } from '@/wholesaler-map/components/WholesalerMapNavigationItem';

const mockUseWholesalerMapAccess = jest.fn();

jest.mock('@/wholesaler-map/hooks/useWholesalerMapAccess', () => ({
  useWholesalerMapAccess: () => mockUseWholesalerMapAccess(),
}));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => ({
    NavigationDrawerItem: ({
      active,
      label,
      to,
    }: {
      active: boolean;
      label: string;
      to: string;
    }) => (
      <a aria-current={active ? 'page' : undefined} href={to}>
        {label}
      </a>
    ),
  }),
);

const renderNavigationItem = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/wholesalers/map']}
      >
        <WholesalerMapNavigationItem />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('WholesalerMapNavigationItem', () => {
  it('links to the active map when Company map fields are readable', () => {
    mockUseWholesalerMapAccess.mockReturnValue({ canViewMap: true });

    renderNavigationItem();

    expect(
      screen.getByRole('link', { name: 'Wholesaler coverage' }),
    ).toHaveAttribute('href', '/wholesalers/map');
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('does not reveal the map navigation item without read access', () => {
    mockUseWholesalerMapAccess.mockReturnValue({ canViewMap: false });

    renderNavigationItem();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
