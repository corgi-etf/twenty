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
    clusterMaxZoom: 14,
    clusterRadius: 50,
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
        100,
        WHOLESALER_COVERAGE_MAP_COLORS.clusterMedium,
        750,
        WHOLESALER_COVERAGE_MAP_COLORS.clusterHigh,
      ],
      'circle-radius': ['step', ['get', 'point_count'], 17, 100, 23, 750, 30],
      'circle-stroke-color': WHOLESALER_COVERAGE_MAP_COLORS.invertedText,
      'circle-stroke-width': 1,
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
    id: WHOLESALER_COVERAGE_MAP_IDS.unclusteredLayer,
    type: 'circle',
    source: WHOLESALER_COVERAGE_MAP_IDS.source,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'ownerColor'],
      'circle-opacity': 0.9,
      'circle-radius': 6,
      'circle-stroke-color': WHOLESALER_COVERAGE_MAP_COLORS.invertedText,
      'circle-stroke-width': 1,
    },
  });
};
