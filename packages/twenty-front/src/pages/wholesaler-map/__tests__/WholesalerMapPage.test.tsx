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
  WholesalerMapContent: ({
    featureCollection,
  }: {
    featureCollection: {
      features: Array<{ properties: { ownerColor: string } }>;
    };
  }) => (
    <div>
      Wholesaler map content
      {featureCollection.features.length > 0 && (
        <span data-testid="owner-color">
          {featureCollection.features[0].properties.ownerColor}
        </span>
      )}
    </div>
  ),
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
  PageCardHeader: ({ title }: { title: ReactNode }) => <div>{title}</div>,
}));
jest.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: ({ title }: { title: string }) => (
    <div data-testid="page-title">{title}</div>
  ),
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
      screen.getByRole('heading', { name: 'Territory map' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent(
      'Territory map | Twenty',
    );
    expect(screen.getByText('Wholesaler map content')).toBeInTheDocument();
  });

  it('normalizes mapped owners with a MapLibre-compatible color', () => {
    mockUseWholesalerMapCompanies.mockReturnValue({
      canViewMap: true,
      error: undefined,
      hasWholesalerRelation: true,
      isLoadingAllCompanies: false,
      records: [
        {
          id: 'company-1',
          name: 'Northstar Capital',
          address: {
            addressCity: 'Chicago',
            addressState: 'IL',
            addressPostcode: '60601',
            addressCountry: 'US',
            addressLat: 41.8781,
            addressLng: -87.6298,
          },
          historicalOwner: { id: 'owner-1', name: 'Alex Morgan' },
        },
      ],
      refetch: jest.fn(),
      totalCount: 1,
    });

    renderPage();

    expect(screen.getByTestId('owner-color')).toHaveTextContent(
      /^#[\da-f]{6}$/i,
    );
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
