import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { WholesalerMapContent } from '@/wholesaler-map/components/WholesalerMapContent';

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    onChange,
    pinnedOption,
  }: {
    label: string;
    onChange: (value: string | null) => void;
    pinnedOption: { label: string; value: string | null };
  }) => (
    <>
      <button>{label}</button>
      <button onClick={() => onChange(pinnedOption.value)}>
        {pinnedOption.label}
      </button>
    </>
  ),
}));
jest.mock('@/wholesaler-map/components/WholesalerCoverageMap', () => ({
  WholesalerCoverageMap: () => (
    <div data-testid="wholesaler-coverage-map">Map canvas</div>
  ),
}));

const featureCollection = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [-87.6298, 41.8781] as [number, number],
      },
      properties: {
        companyId: 'company-1',
        companyName: 'Northstar Capital',
        locationLabel: 'Chicago, IL, US',
        ownerId: 'owner-1',
        ownerName: 'Alex Morgan',
        ownerColor: 'blue',
      },
    },
  ],
};

type ContentFixtureProps = {
  currentFeatureCollection?: typeof featureCollection;
  isLoading?: boolean;
  loadError?: Error | null;
  hasActiveFilters?: boolean;
  onOwnerChange?: (ownerId: string | null) => void;
  onResetFilters?: () => void;
  selectedOwnerId?: string | null;
  selectedState?: string | null;
};

const ContentFixture = ({
  currentFeatureCollection = featureCollection,
  hasActiveFilters = false,
  isLoading = false,
  loadError = null,
  onOwnerChange = jest.fn(),
  onResetFilters = jest.fn(),
  selectedOwnerId = null,
  selectedState = null,
}: ContentFixtureProps) => (
  <WholesalerMapContent
    countryOptions={[{ value: 'US', label: 'US' }]}
    featureCollection={currentFeatureCollection}
    hasWholesalerRelation
    hasActiveFilters={hasActiveFilters}
    isLoading={isLoading}
    loadError={loadError}
    onCompanySelect={jest.fn()}
    onCountryChange={jest.fn()}
    onOwnerChange={onOwnerChange}
    onPostcodeChange={jest.fn()}
    onResetFilters={onResetFilters}
    onRetry={jest.fn()}
    onStateChange={jest.fn()}
    ownerOptions={[{ value: 'owner-1', label: 'Alex Morgan' }]}
    postcodeOptions={[{ value: '60601', label: '60601' }]}
    selectedCountry={null}
    selectedOwnerId={selectedOwnerId}
    selectedPostcode={null}
    selectedState={selectedState}
    stateOptions={[{ value: 'IL', label: 'IL' }]}
    totalCompanyCount={1}
  />
);

const renderContent = (content: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{content}</I18nProvider>);

describe('WholesalerMapContent', () => {
  it('renders a mapped count, territory filters, map, and equivalent lead list', () => {
    renderContent(<ContentFixture />);

    expect(
      screen.getByTestId('wholesaler-map-located-count'),
    ).toHaveTextContent('1 mapped lead');
    expect(
      screen.getByRole('button', { name: 'Wholesaler' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ZIP code' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Country' })).toBeInTheDocument();
    expect(screen.getByTestId('wholesaler-coverage-map')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /northstar capital/i }),
    ).toHaveTextContent('Chicago, IL, US');
  });

  it('clears all active territory filters with one action', () => {
    const onResetFilters = jest.fn();

    renderContent(
      <ContentFixture
        hasActiveFilters
        onResetFilters={onResetFilters}
        selectedState="IL"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it('provides a pinned option that clears the selected wholesaler', () => {
    const onOwnerChange = jest.fn();

    renderContent(<ContentFixture onOwnerChange={onOwnerChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All wholesalers' }));

    expect(onOwnerChange).toHaveBeenCalledWith(null);
  });

  it('keeps the clear filter available for an owner without mapped leads', () => {
    const onOwnerChange = jest.fn();

    renderContent(
      <ContentFixture
        currentFeatureCollection={{
          type: 'FeatureCollection',
          features: [],
        }}
        onOwnerChange={onOwnerChange}
        hasActiveFilters
        selectedOwnerId="owner-1"
      />,
    );

    expect(
      screen.getByText('No mapped leads match these filters'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Wholesaler' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All wholesalers' }));

    expect(onOwnerChange).toHaveBeenCalledWith(null);
  });

  it('distinguishes an empty filter result from missing map coordinates', () => {
    renderContent(
      <ContentFixture
        currentFeatureCollection={{
          type: 'FeatureCollection',
          features: [],
        }}
        hasActiveFilters
        selectedState="IL"
      />,
    );

    expect(
      screen.getByText('No mapped leads match these filters'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Clear the filters to see every mapped company.'),
    ).toBeInTheDocument();
  });

  it('renders explicit loading, failure, and empty states', () => {
    const { rerender } = renderContent(<ContentFixture isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading lead locations',
    );

    rerender(
      <I18nProvider i18n={i18n}>
        <ContentFixture loadError={new Error('Query failed')} />
      </I18nProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Lead locations could not be loaded',
    );

    rerender(
      <I18nProvider i18n={i18n}>
        <ContentFixture
          currentFeatureCollection={{
            type: 'FeatureCollection',
            features: [],
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('No mapped leads')).toBeInTheDocument();
  });
});
