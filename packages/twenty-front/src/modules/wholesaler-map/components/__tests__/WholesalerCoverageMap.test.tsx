import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';

import { WholesalerCoverageMap } from '@/wholesaler-map/components/WholesalerCoverageMap';
import { WHOLESALER_COVERAGE_MAP_COLORS } from '@/wholesaler-map/constants/WholesalerCoverageMapColors';

const mockSetData = jest.fn();
const mockAddSource = jest.fn();
const mockAddLayer = jest.fn();
const mockAddControl = jest.fn();
const mockGetCanvas = jest.fn(() => ({ style: { cursor: '' } }));
const mockGetClusterExpansionZoom = jest.fn().mockResolvedValue(8);
const mockGetSource = jest.fn(() => ({
  getClusterExpansionZoom: mockGetClusterExpansionZoom,
  setData: mockSetData,
}));
const mockRemove = jest.fn();
const mockEaseTo = jest.fn();
const mapEventHandlers = new Map<string, (...args: never[]) => void>();
const mockOn = jest.fn(
  (
    eventName: string,
    layerOrHandler: string | ((...args: never[]) => void),
    possibleHandler?: (...args: never[]) => void,
  ) => {
    const eventKey =
      typeof layerOrHandler === 'string'
        ? `${eventName}:${layerOrHandler}`
        : eventName;
    const handler =
      typeof layerOrHandler === 'function' ? layerOrHandler : possibleHandler;

    if (handler) {
      mapEventHandlers.set(eventKey, handler);
    }
  },
);
const mockOff = jest.fn(
  (
    eventName: string,
    layerOrHandler: string | ((...args: never[]) => void),
  ) => {
    const eventKey =
      typeof layerOrHandler === 'string'
        ? `${eventName}:${layerOrHandler}`
        : eventName;

    mapEventHandlers.delete(eventKey);
  },
);
const mockMap = {
  addControl: mockAddControl,
  addLayer: mockAddLayer,
  addSource: mockAddSource,
  easeTo: mockEaseTo,
  getCanvas: mockGetCanvas,
  getSource: mockGetSource,
  on: mockOn,
  off: mockOff,
  remove: mockRemove,
};

jest.mock('maplibre-gl', () => ({
  AttributionControl: jest.fn(),
  MapLibreMap: jest.fn(function MockMapLibreMap() {
    return mockMap;
  }),
  NavigationControl: jest.fn(),
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
        firmPhone: '312-555-0199',
        fullAddress: '100 W Lake St, Chicago, IL 60601, US',
        leadStatus: 'Follow-up',
        linkedinUrl: 'https://www.linkedin.com/company/northstar',
        locationLabel: 'Chicago, IL, US',
        notes: 'Call next week',
        ownerId: 'owner-1',
        ownerName: 'Alex Morgan',
        ownerTerritory: 'Chicago',
        ownerColor: WHOLESALER_COVERAGE_MAP_COLORS.clusterLow,
        postcode: '60601',
        state: 'IL',
      },
    },
  ],
};

const renderMap = (
  onCompanySelect = jest.fn(),
  selectedCompanyId: string | null = null,
) =>
  render(
    <I18nProvider i18n={i18n}>
      <WholesalerCoverageMap
        featureCollection={featureCollection}
        onCompanySelect={onCompanySelect}
        selectedCompanyId={selectedCompanyId}
      />
    </I18nProvider>,
  );

describe('WholesalerCoverageMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mapEventHandlers.clear();
  });

  it('exposes readiness only after the source and layers are initialized', () => {
    renderMap();

    expect(
      screen.queryByTestId('wholesaler-coverage-map-ready'),
    ).not.toBeInTheDocument();

    act(() => mapEventHandlers.get('load')?.());

    expect(
      screen.getByRole('img', { name: /lead coverage by wholesaler/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('wholesaler-coverage-map-ready'),
    ).toBeInTheDocument();
    expect(mockAddSource).toHaveBeenCalledWith('wholesaler-leads', {
      type: 'geojson',
      data: expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ isSelected: false }),
          }),
        ],
      }),
      cluster: true,
      clusterMaxZoom: 10,
      clusterRadius: 32,
    });
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'territory-boundaries' }),
    );
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lead-clusters' }),
    );
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'unclustered-leads' }),
    );
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-lead-halo' }),
    );

    const clusterLayer = mockAddLayer.mock.calls.find(
      ([layer]) => layer.id === 'lead-clusters',
    )?.[0];
    const clusterCountLayer = mockAddLayer.mock.calls.find(
      ([layer]) => layer.id === 'lead-cluster-count',
    )?.[0];
    const unclusteredLayer = mockAddLayer.mock.calls.find(
      ([layer]) => layer.id === 'unclustered-leads',
    )?.[0];
    const mapLibreSafeColor = /^#[\da-f]{6}$/i;

    expect(clusterLayer.paint['circle-color'][2]).toMatch(mapLibreSafeColor);
    expect(clusterLayer.paint['circle-color'][4]).toMatch(mapLibreSafeColor);
    expect(clusterLayer.paint['circle-color'][6]).toMatch(mapLibreSafeColor);
    expect(clusterLayer.paint['circle-stroke-color']).toMatch(
      mapLibreSafeColor,
    );
    expect(clusterCountLayer.paint['text-color']).toMatch(mapLibreSafeColor);
    expect(unclusteredLayer.paint['circle-stroke-color']).toMatch(
      mapLibreSafeColor,
    );
  });

  it('updates the selection halo and centers the selected company without recreating the map', () => {
    const { rerender } = renderMap();
    act(() => mapEventHandlers.get('load')?.());

    rerender(
      <I18nProvider i18n={i18n}>
        <WholesalerCoverageMap
          featureCollection={featureCollection}
          onCompanySelect={jest.fn()}
          selectedCompanyId="company-1"
        />
      </I18nProvider>,
    );

    expect(mockSetData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ isSelected: true }),
          }),
        ],
      }),
    );
    expect(mockEaseTo).toHaveBeenLastCalledWith({
      center: [-87.6298, 41.8781],
      duration: 450,
      zoom: 11,
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('selects a Company through an unclustered map point', () => {
    const onCompanySelect = jest.fn();

    renderMap(onCompanySelect);
    act(() => mapEventHandlers.get('load')?.());
    mapEventHandlers.get('click:unclustered-leads')?.({
      features: [{ properties: { companyId: 'company-1' } }],
    } as never);

    expect(onCompanySelect).toHaveBeenCalledWith('company-1');
  });

  it('surfaces asynchronous MapLibre errors and removes every listener', () => {
    const { unmount } = renderMap();

    act(() => mapEventHandlers.get('load')?.());
    act(() => mapEventHandlers.get('error')?.());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The interactive map could not load',
    );
    expect(
      screen.queryByTestId('wholesaler-coverage-map-ready'),
    ).not.toBeInTheDocument();

    unmount();

    expect(mockOff).toHaveBeenCalledWith('load', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith(
      'click',
      'unclustered-leads',
      expect.any(Function),
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('surfaces cluster expansion failures without an unhandled rejection', async () => {
    mockGetClusterExpansionZoom.mockRejectedValueOnce(
      new Error('Cluster expansion failed'),
    );
    renderMap();
    act(() => mapEventHandlers.get('load')?.());

    await act(async () => {
      mapEventHandlers.get('click:lead-clusters')?.({
        features: [
          {
            geometry: { type: 'Point', coordinates: [-87.6298, 41.8781] },
            properties: { cluster_id: 1 },
          },
        ],
      } as never);
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The interactive map could not load',
    );
  });
});
