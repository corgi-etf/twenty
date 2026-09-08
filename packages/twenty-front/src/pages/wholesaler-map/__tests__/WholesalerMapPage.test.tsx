import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { WholesalerMapPage } from '~/pages/wholesaler-map/WholesalerMapPage';

const mockUseWholesalerMapCompanies = jest.fn();

jest.mock('@/wholesaler-map/hooks/useWholesalerMapCompanies', () => ({
  useWholesalerMapCompanies: () => mockUseWholesalerMapCompanies(),
}));
jest.mock('@/wholesaler-map/components/WholesalerMapContent', () => ({
  WholesalerMapContent: () => <div>Wholesaler map content</div>,
}));
jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({
    header,
    children,
  }: {
    header: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));
jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
}));
jest.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: () => null,
}));
jest.mock(
  '@/object-record/record-index/components/RecordIndexEmptyStateNotShared',
  () => ({
    RecordIndexEmptyStateNotShared: () => <div>Object not shared</div>,
  }),
);

const renderPage = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <WholesalerMapPage />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('WholesalerMapPage', () => {
  beforeEach(() => {
    mockUseWholesalerMapCompanies.mockReturnValue({
      canViewMap: true,
      error: undefined,
      hasWholesalerRelation: true,
      isLoadingAllCompanies: false,
      records: [],
      refetch: jest.fn(),
      totalCount: 0,
    });
  });

  it('renders the native page heading and map content for readable Companies', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Wholesaler coverage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Wholesaler map content')).toBeInTheDocument();
  });

  it('shows the standard permission fallback when Company map data is hidden', () => {
    mockUseWholesalerMapCompanies.mockReturnValue({
      canViewMap: false,
      error: undefined,
      hasWholesalerRelation: false,
      isLoadingAllCompanies: false,
      records: [],
      refetch: jest.fn(),
      totalCount: 0,
    });

    renderPage();

    expect(screen.getByText('Object not shared')).toBeInTheDocument();
    expect(
      screen.queryByText('Wholesaler map content'),
    ).not.toBeInTheDocument();
  });
});
