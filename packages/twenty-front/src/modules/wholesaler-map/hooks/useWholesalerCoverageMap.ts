import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AttributionControl,
  type GeoJSONSource,
  MapLibreMap,
  NavigationControl,
} from 'maplibre-gl';

import { WHOLESALER_COVERAGE_MAP_IDS } from '@/wholesaler-map/constants/WholesalerCoverageMapConstants';
import { WHOLESALER_MAP_DATA_CONTRACT } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';
import { addWholesalerCoverageMapLayers } from '@/wholesaler-map/utils/addWholesalerCoverageMapLayers';
import { registerWholesalerCoverageMapInteractions } from '@/wholesaler-map/utils/registerWholesalerCoverageMapInteractions';

type UseWholesalerCoverageMapArgs = {
  containerRef: RefObject<HTMLDivElement | null>;
  featureCollection: WholesalerMapFeatureCollection;
  onCompanySelect: (companyId: string) => void;
};

export const useWholesalerCoverageMap = ({
  containerRef,
  featureCollection,
  onCompanySelect,
}: UseWholesalerCoverageMapArgs) => {
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

    let map: MapLibreMap | null = null;

    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: WHOLESALER_MAP_DATA_CONTRACT.styleUrl,
        center: [-97, 38],
        zoom: 2.6,
        attributionControl: false,
      });
      map.addControl(
        new NavigationControl({ showCompass: false }),
        'top-right',
      );
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: 'Map data © OpenStreetMap contributors',
        }),
      );
    } catch {
      map?.remove();
      queueMicrotask(() => setHasMapError(true));
      return;
    }

    mapRef.current = map;
    const handleMapError = () => {
      isMapReadyRef.current = false;
      setIsMapReady(false);
      setHasMapError(true);
    };
    const handleLoad = () => {
      try {
        addWholesalerCoverageMapLayers({
          featureCollection: featureCollectionRef.current,
          map,
        });
        isMapReadyRef.current = true;
        setIsMapReady(true);
      } catch {
        handleMapError();
      }
    };
    const unregisterInteractions = registerWholesalerCoverageMapInteractions({
      map,
      onCompanySelect: (companyId) => onCompanySelectRef.current(companyId),
      onError: handleMapError,
    });

    map.on('load', handleLoad);
    map.on('error', handleMapError);

    return () => {
      isMapReadyRef.current = false;
      map.off('load', handleLoad);
      map.off('error', handleMapError);
      unregisterInteractions();
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    if (!isMapReadyRef.current) {
      return;
    }

    const source = mapRef.current?.getSource(
      WHOLESALER_COVERAGE_MAP_IDS.source,
    ) as GeoJSONSource | undefined;

    source?.setData(featureCollection);
  }, [featureCollection]);

  return { hasMapError, isMapReady };
};
