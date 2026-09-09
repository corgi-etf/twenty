import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';

import { WholesalerMapContent } from '@/wholesaler-map/components/WholesalerMapContent';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

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
  WholesalerCoverageMap: ({
    featureCollection,
    onCompanySelect,
    selectedCompanyId,
  }: {
    featureCollection: WholesalerMapFeatureCollection;
    onCompanySelect: (companyId: string) => void;
    selectedCompanyId: string | null;
  }) => (
    <div data-testid="wholesaler-coverage-map">
      Map canvas
      {featureCollection.features.map(({ properties }) => (
        <button
          aria-pressed={selectedCompanyId === properties.companyId}
          key={properties.companyId}
          onClick={() => onCompanySelect(properties.companyId)}
        >
          Select {properties.companyName} on map
        </button>
      ))}
    </div>
  ),
}));

const featureCollection: WholesalerMapFeatureCollection = {
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
        firmPhone: '312-555-0199',
        fullAddress: '100 W Lake St, Chicago, IL 60601, US',
        leadStatus: 'Follow-up',
        linkedinUrl: 'https://www.linkedin.com/company/northstar',
        locationLabel: 'Chicago, IL 60601, US',
        notes: 'Asked for a call after the investment committee meeting.',
        ownerId: 'owner-1',
        ownerName: 'Alex Morgan',
        ownerTerritory: 'Chicago',
        ownerColor: 'blue',
        postcode: '60601',
        state: 'IL',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-80.1918, 25.7617],
      },
      properties: {
        companyId: 'company-2',
        companyName: 'Seabreeze Partners',
        firmPhone: '305-555-0142',
        fullAddress: '200 Brickell Ave, Miami, FL 33131, US',
        leadStatus: 'New',
        linkedinUrl: '',
        locationLabel: 'Miami, FL 33131, US',
        notes: '',
        ownerId: 'owner-2',
        ownerName: 'Nash',
        ownerTerritory: 'Florida',
        ownerColor: 'red',
        postcode: '33131',
        state: 'FL',
      },
    },
  ],
};

type ContentFixtureProps = {
  currentFeatureCollection?: WholesalerMapFeatureCollection;
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
    onCompanyOpen={jest.fn()}
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
    totalCompanyCount={2}
  />
);

const renderContent = (content: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{content}</I18nProvider>);

describe('WholesalerMapContent', () => {
  it('renders a mapped count, territory filters, map, and equivalent lead list', () => {
    renderContent(<ContentFixture />);

    expect(
      screen.getByTestId('wholesaler-map-located-count'),
    ).toHaveTextContent('2 mapped leads');
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
      within(
        screen.getByRole('complementary', { name: 'Mapped leads' }),
      ).getByRole('button', { name: /northstar capital/i }),
    ).toHaveTextContent('Chicago, IL 60601, US');
  });

  it('updates the company detail panel immediately from list and map selection', () => {
    const onCompanyOpen = jest.fn();

    renderContent(
      <WholesalerMapContent
        countryOptions={[{ value: 'US', label: 'US' }]}
        featureCollection={featureCollection}
        hasActiveFilters={false}
        hasWholesalerRelation
        isLoading={false}
        loadError={null}
        onCompanyOpen={onCompanyOpen}
        onCountryChange={jest.fn()}
        onOwnerChange={jest.fn()}
        onPostcodeChange={jest.fn()}
        onResetFilters={jest.fn()}
        onRetry={jest.fn()}
        onStateChange={jest.fn()}
        ownerOptions={[]}
        postcodeOptions={[]}
        selectedCountry={null}
        selectedOwnerId={null}
        selectedPostcode={null}
        selectedState={null}
        stateOptions={[]}
        totalCompanyCount={2}
      />,
    );

    expect(
      screen.getByTestId('territory-company-details-empty'),
    ).toHaveTextContent('Select a company');

    fireEvent.click(
      within(
        screen.getByRole('complementary', { name: 'Mapped leads' }),
      ).getByRole('button', { name: /northstar capital/i }),
    );
    const details = screen.getByTestId('territory-company-details');
    expect(details).toHaveTextContent('Northstar Capital');
    expect(details).toHaveTextContent('312-555-0199');
    expect(details).toHaveTextContent('100 W Lake St');
    expect(details).toHaveTextContent('IL');
    expect(details).toHaveTextContent('60601');
    expect(details).toHaveTextContent('Alex Morgan');
    expect(details).toHaveTextContent('Chicago');
    expect(details).toHaveTextContent('investment committee');
    expect(screen.getByRole('link', { name: 'Open LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/northstar',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Seabreeze Partners on map' }),
    );
    expect(details).toHaveTextContent('Seabreeze Partners');
    expect(details).toHaveTextContent('305-555-0142');
    expect(details).toHaveTextContent('Nash');
    expect(details).toHaveTextContent('Florida');

    fireEvent.click(
      screen.getByRole('button', { name: 'Open full company record' }),
    );
    expect(onCompanyOpen).toHaveBeenCalledWith('company-2');
  });

  it('searches the map and company list using BDR-facing fields', () => {
    renderContent(<ContentFixture />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Find a company' }), {
      target: { value: '305-555' },
    });

    const mappedLeads = screen.getByRole('complementary', {
      name: 'Mapped leads',
    });
    expect(
      within(mappedLeads).queryByRole('button', { name: /northstar capital/i }),
    ).not.toBeInTheDocument();
    expect(
      within(mappedLeads).getByRole('button', { name: /seabreeze partners/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 company')).toBeInTheDocument();
  });

  it('makes a selected company non-actionable when search hides it', () => {
    renderContent(<ContentFixture />);

    fireEvent.click(
      within(
        screen.getByRole('complementary', { name: 'Mapped leads' }),
      ).getByRole('button', { name: /northstar capital/i }),
    );
    expect(screen.getByTestId('territory-company-details')).toHaveTextContent(
      'Northstar Capital',
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Find a company' }), {
      target: { value: 'Seabreeze' },
    });

    expect(
      screen.queryByTestId('territory-company-details'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('territory-company-details-empty'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open full company record' }),
    ).not.toBeInTheDocument();
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
