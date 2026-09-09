import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useRef } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useWholesalerCoverageMap } from '@/wholesaler-map/hooks/useWholesalerCoverageMap';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

import 'maplibre-gl/dist/maplibre-gl.css';

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
  selectedCompanyId: string | null;
};

export const WholesalerCoverageMap = ({
  featureCollection,
  onCompanySelect,
  selectedCompanyId,
}: WholesalerCoverageMapProps) => {
  const { t } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);
  const { hasMapError, isMapReady } = useWholesalerCoverageMap({
    containerRef,
    featureCollection,
    onCompanySelect,
    selectedCompanyId,
  });

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
