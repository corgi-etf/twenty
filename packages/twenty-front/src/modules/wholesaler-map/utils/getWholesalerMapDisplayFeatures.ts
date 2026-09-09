import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

export const getWholesalerMapDisplayFeatures = (
  featureCollection: WholesalerMapFeatureCollection,
  selectedCompanyId: string | null,
): WholesalerMapFeatureCollection => ({
  type: 'FeatureCollection',
  features: featureCollection.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      isSelected: feature.properties.companyId === selectedCompanyId,
    },
  })),
});
