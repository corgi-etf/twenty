import { isNonEmptyString } from '@sniptt/guards';
import {
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapLibreMap,
} from 'maplibre-gl';

import { WHOLESALER_COVERAGE_MAP_IDS } from '@/wholesaler-map/constants/WholesalerCoverageMapConstants';

type RegisterWholesalerCoverageMapInteractionsArgs = {
  map: MapLibreMap;
  onCompanySelect: (companyId: string) => void;
  onError: () => void;
};

export const registerWholesalerCoverageMapInteractions = ({
  map,
  onCompanySelect,
  onError,
}: RegisterWholesalerCoverageMapInteractionsArgs) => {
  const handleUnclusteredClick = (event: MapLayerMouseEvent) => {
    const companyId = event.features?.[0]?.properties?.companyId;

    if (isNonEmptyString(companyId)) {
      onCompanySelect(companyId);
    }
  };
  const handleClusterClick = (event: MapLayerMouseEvent) => {
    const clusterFeature = event.features?.[0];
    const clusterId = Number(clusterFeature?.properties?.cluster_id);
    const coordinates =
      clusterFeature?.geometry.type === 'Point'
        ? clusterFeature.geometry.coordinates
        : null;
    const source = map.getSource(WHOLESALER_COVERAGE_MAP_IDS.source) as
      | GeoJSONSource
      | undefined;

    if (
      source === undefined ||
      !Number.isInteger(clusterId) ||
      coordinates === null
    ) {
      return;
    }

    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
      })
      .catch(onError);
  };
  const handleMouseEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = '';
  };

  map.on(
    'click',
    WHOLESALER_COVERAGE_MAP_IDS.unclusteredLayer,
    handleUnclusteredClick,
  );
  map.on('click', WHOLESALER_COVERAGE_MAP_IDS.clusterLayer, handleClusterClick);
  for (const layerId of WHOLESALER_COVERAGE_MAP_IDS.interactiveLayers) {
    map.on('mouseenter', layerId, handleMouseEnter);
    map.on('mouseleave', layerId, handleMouseLeave);
  }

  return () => {
    map.off(
      'click',
      WHOLESALER_COVERAGE_MAP_IDS.unclusteredLayer,
      handleUnclusteredClick,
    );
    map.off(
      'click',
      WHOLESALER_COVERAGE_MAP_IDS.clusterLayer,
      handleClusterClick,
    );
    for (const layerId of WHOLESALER_COVERAGE_MAP_IDS.interactiveLayers) {
      map.off('mouseenter', layerId, handleMouseEnter);
      map.off('mouseleave', layerId, handleMouseLeave);
    }
  };
};
