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
    onChange: (value: null) => void;
    pinnedOption: { label: string; value: null };
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
  onOwnerChange?: (ownerId: string | null) => void;
};

const ContentFixture = ({
  currentFeatureCollection = featureCollection,
  isLoading = false,
  loadError = null,
  onOwnerChange = jest.fn(),
}: ContentFixtureProps) => (
  <WholesalerMapContent
    featureCollection={currentFeatureCollection}
    hasWholesalerRelation
    isLoading={isLoading}
    loadError={loadError}
    onCompanySelect={jest.fn()}
    onOwnerChange={onOwnerChange}
    onRetry={jest.fn()}
    ownerOptions={[{ value: 'owner-1', label: 'Alex Morgan' }]}
    selectedOwnerId={null}
    totalCompanyCount={1}
  />
);

const renderContent = (content: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{content}</I18nProvider>);

describe('WholesalerMapContent', () => {
  it('renders a mapped count, owner filter, map, and equivalent lead list', () => {
    renderContent(<ContentFixture />);

    expect(
      screen.getByTestId('wholesaler-map-located-count'),
    ).toHaveTextContent('1 mapped lead');
    expect(
      screen.getByRole('button', { name: 'Wholesaler' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('wholesaler-coverage-map')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /northstar capital/i }),
    ).toHaveTextContent('Chicago, IL, US');
  });

  it('provides a pinned option that clears the selected wholesaler', () => {
    const onOwnerChange = jest.fn();

    renderContent(<ContentFixture onOwnerChange={onOwnerChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All wholesalers' }));

    expect(onOwnerChange).toHaveBeenCalledWith(null);
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
