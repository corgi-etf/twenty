import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import {
  AttributionControl,
  type GeoJSONSource,
  MapLibreMap,
  type MapLayerMouseEvent,
  NavigationControl,
} from 'maplibre-gl';
import { isNonEmptyString } from '@sniptt/guards';
import { themeCssVariables, useTheme } from 'twenty-ui/theme-constants';

import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

import 'maplibre-gl/dist/maplibre-gl.css';

const SOURCE_ID = 'wholesaler-leads';
const CLUSTER_LAYER_ID = 'lead-clusters';
const CLUSTER_COUNT_LAYER_ID = 'lead-cluster-count';
const UNCLUSTERED_LAYER_ID = 'unclustered-leads';

const StyledMapContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  height: 100%;
  min-height: 360px;
  position: relative;
  width: 100%;

  .maplibregl-ctrl-group {
    border-radius: ${themeCssVariables.border.radius.md};
  }
`;

const StyledMapCanvas = styled.div`
  height: 100%;
  min-height: 360px;
  width: 100%;
`;

const StyledMapError = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 360px;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

type WholesalerCoverageMapProps = {
  featureCollection: WholesalerMapFeatureCollection;
  onCompanySelect: (companyId: string) => void;
};

export const WholesalerCoverageMap = ({
  featureCollection,
  onCompanySelect,
}: WholesalerCoverageMapProps) => {
  const { t } = useLingui();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  // MapLibre owns mutable resources outside React's render lifecycle.
  // oxlint-disable-next-line twenty/no-state-useref
  const mapRef = useRef<MapLibreMap | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const isMapReadyRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const featureCollectionRef = useRef(featureCollection);
  // oxlint-disable-next-line twenty/no-state-useref
  const onCompanySelectRef = useRef(onCompanySelect);
  const [hasMapError, setHasMapError] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  featureCollectionRef.current = featureCollection;
  onCompanySelectRef.current = onCompanySelect;

  useEffect(() => {
    isMapReadyRef.current = false;
    setIsMapReady(false);

    if (containerRef.current === null || mapRef.current !== null) {
      return;
    }

    let map: MapLibreMap;

    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: WHOLESALER_MAP_DATA_CONTRACT.styleUrl,
        center: [-97, 38],
        zoom: 2.6,
        attributionControl: false,
      });
    } catch {
      queueMicrotask(() => setHasMapError(true));
      return;
    }

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: 'Map data © OpenStreetMap contributors',
      }),
    );

    const handleMapError = () => {
      isMapReadyRef.current = false;
      setIsMapReady(false);
      setHasMapError(true);
    };
    const handleLoad = () => {
      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: featureCollectionRef.current,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              theme.color.blue9,
              100,
              theme.color.green9,
              750,
              theme.color.orange9,
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              17,
              100,
              23,
              750,
              30,
            ],
            'circle-stroke-color': theme.font.color.inverted,
            'circle-stroke-width': 1,
          },
        });
        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
          },
          paint: {
            'text-color': theme.font.color.inverted,
          },
        });
        map.addLayer({
          id: UNCLUSTERED_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'ownerColor'],
            'circle-opacity': 0.9,
            'circle-radius': 6,
            'circle-stroke-color': theme.font.color.inverted,
            'circle-stroke-width': 1,
          },
        });
        isMapReadyRef.current = true;
        setIsMapReady(true);
      } catch {
        handleMapError();
      }
    };
    const handleUnclusteredClick = (event: MapLayerMouseEvent) => {
      const companyId = event.features?.[0]?.properties?.companyId;

      if (isNonEmptyString(companyId)) {
        onCompanySelectRef.current(companyId);
      }
    };
    const handleClusterClick = (event: MapLayerMouseEvent) => {
      const clusterFeature = event.features?.[0];
      const clusterId = Number(clusterFeature?.properties?.cluster_id);
      const coordinates =
        clusterFeature?.geometry.type === 'Point'
          ? clusterFeature.geometry.coordinates
          : null;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;

      if (
        source === undefined ||
        !Number.isInteger(clusterId) ||
        coordinates === null
      ) {
        return;
      }

      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({
          center: [coordinates[0], coordinates[1]],
          zoom,
        });
      });
    };
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', handleLoad);
    map.on('error', handleMapError);
    map.on('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
    map.on('click', CLUSTER_LAYER_ID, handleClusterClick);
    for (const layerId of [CLUSTER_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
      map.on('mouseenter', layerId, handleMouseEnter);
      map.on('mouseleave', layerId, handleMouseLeave);
    }

    return () => {
      isMapReadyRef.current = false;
      map.off('load', handleLoad);
      map.off('error', handleMapError);
      map.off('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
      map.off('click', CLUSTER_LAYER_ID, handleClusterClick);
      for (const layerId of [CLUSTER_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
        map.off('mouseenter', layerId, handleMouseEnter);
        map.off('mouseleave', layerId, handleMouseLeave);
      }
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    if (!isMapReadyRef.current) {
      return;
    }

    const source = mapRef.current?.getSource(SOURCE_ID) as
      | GeoJSONSource
      | undefined;

    source?.setData(featureCollection);
  }, [featureCollection]);

  if (hasMapError) {
    return (
      <StyledMapError role="alert">
        {t`The interactive map could not load. Use the lead list beside it to open every mapped company.`}
      </StyledMapError>
    );
  }

  return (
    <StyledMapContainer
      aria-label={t`Lead coverage by wholesaler. The adjacent list contains the same companies.`}
      data-testid="wholesaler-coverage-map"
      role="img"
    >
      <StyledMapCanvas
        data-testid={isMapReady ? 'wholesaler-coverage-map-ready' : undefined}
        ref={containerRef}
      />
    </StyledMapContainer>
  );
};
