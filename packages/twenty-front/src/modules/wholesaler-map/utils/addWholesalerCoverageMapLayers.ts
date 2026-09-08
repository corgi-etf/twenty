import { type MapLibreMap } from 'maplibre-gl';

import { WHOLESALER_COVERAGE_MAP_IDS } from '@/wholesaler-map/constants/WholesalerCoverageMapConstants';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

type AddWholesalerCoverageMapLayersArgs = {
  clusterHighColor: string;
  clusterLowColor: string;
  clusterMediumColor: string;
  featureCollection: WholesalerMapFeatureCollection;
  invertedTextColor: string;
  map: MapLibreMap;
};

export const addWholesalerCoverageMapLayers = ({
  clusterHighColor,
  clusterLowColor,
  clusterMediumColor,
  featureCollection,
  invertedTextColor,
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
        clusterLowColor,
        100,
        clusterMediumColor,
        750,
        clusterHighColor,
      ],
      'circle-radius': ['step', ['get', 'point_count'], 17, 100, 23, 750, 30],
      'circle-stroke-color': invertedTextColor,
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
      'text-color': invertedTextColor,
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
      'circle-stroke-color': invertedTextColor,
      'circle-stroke-width': 1,
    },
  });
};
