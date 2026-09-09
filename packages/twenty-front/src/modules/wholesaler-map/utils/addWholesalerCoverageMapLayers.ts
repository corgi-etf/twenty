import { type MapLibreMap } from 'maplibre-gl';

import { WHOLESALER_COVERAGE_MAP_COLORS } from '@/wholesaler-map/constants/WholesalerCoverageMapColors';
import { WHOLESALER_COVERAGE_MAP_IDS } from '@/wholesaler-map/constants/WholesalerCoverageMapConstants';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

type AddWholesalerCoverageMapLayersArgs = {
  featureCollection: WholesalerMapFeatureCollection;
  map: MapLibreMap;
};

export const addWholesalerCoverageMapLayers = ({
  featureCollection,
  map,
}: AddWholesalerCoverageMapLayersArgs) => {
  map.addSource(WHOLESALER_COVERAGE_MAP_IDS.source, {
    type: 'geojson',
    data: featureCollection,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 32,
  });
  map.addLayer({
    id: WHOLESALER_COVERAGE_MAP_IDS.territoryBoundaryLayer,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'boundary',
    filter: [
      'all',
      ['==', ['get', 'admin_level'], 4],
      ['!=', ['get', 'maritime'], 1],
    ],
    paint: {
      'line-color': WHOLESALER_COVERAGE_MAP_COLORS.territoryBoundary,
      'line-opacity': 0.72,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        2,
        0.8,
        6,
        1.5,
        10,
        2.25,
      ],
    },
  });
  map.addLayer({
    id: WHOLESALER_COVERAGE_MAP_IDS.clusterLayer,
    type: 'circle',
    source: WHOLESALER_COVERAGE_MAP_IDS.source,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        WHOLESALER_COVERAGE_MAP_COLORS.clusterLow,
        25,
        WHOLESALER_COVERAGE_MAP_COLORS.clusterMedium,
        100,
        WHOLESALER_COVERAGE_MAP_COLORS.clusterHigh,
      ],
      'circle-radius': ['step', ['get', 'point_count'], 16, 25, 21, 100, 27],
      'circle-stroke-color': WHOLESALER_COVERAGE_MAP_COLORS.invertedText,
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: WHOLESALER_COVERAGE_MAP_IDS.clusterCountLayer,
    type: 'symbol',
    source: WHOLESALER_COVERAGE_MAP_IDS.source,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: {
      'text-color': WHOLESALER_COVERAGE_MAP_COLORS.invertedText,
    },
  });
  map.addLayer({
    id: WHOLESALER_COVERAGE_MAP_IDS.selectedLeadLayer,
    type: 'circle',
    source: WHOLESALER_COVERAGE_MAP_IDS.source,
    filter: [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'isSelected'], true],
    ],
    paint: {
      'circle-color': WHOLESALER_COVERAGE_MAP_COLORS.invertedText,
      'circle-opacity': 0.92,
      'circle-radius': 13,
      'circle-stroke-color': WHOLESALER_COVERAGE_MAP_COLORS.selectedLead,
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: WHOLESALER_COVERAGE_MAP_IDS.unclusteredLayer,
    type: 'circle',
    source: WHOLESALER_COVERAGE_MAP_IDS.source,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'ownerColor'],
      'circle-opacity': 0.9,
      'circle-radius': 7,
      'circle-stroke-color': WHOLESALER_COVERAGE_MAP_COLORS.selectedLead,
      'circle-stroke-width': 1.5,
    },
  });
};
