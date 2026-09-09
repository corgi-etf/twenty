import { styled } from '@linaria/react';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { LightButton, type SelectOption } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { WholesalerCoverageMap } from '@/wholesaler-map/components/WholesalerCoverageMap';
import { WholesalerMapFilters } from '@/wholesaler-map/components/WholesalerMapFilters';
import { type WholesalerMapFeatureCollection } from '@/wholesaler-map/types/WholesalerMapCompany';

const StyledState = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[8]};
  text-align: center;
`;

const StyledContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledToolbar = styled.div`
  align-items: flex-end;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  min-height: ${themeCssVariables.spacing[12]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledMappedCount = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  white-space: nowrap;
`;

const StyledMapAndList = styled.div`
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  min-height: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(360px, 55vh) minmax(240px, auto);
    overflow: auto;
  }
`;

const StyledLeadList = styled.aside`
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  min-height: 0;
  overflow: auto;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    border-left: 0;
    border-top: 1px solid ${themeCssVariables.border.color.medium};
  }
`;

const StyledLeadListHeading = styled.h2`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  padding: ${themeCssVariables.spacing[3]};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const StyledLeadListItems = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledLeadButton = styled.button`
  background: transparent;
  border: 0;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;

  &:hover,
  &:focus-visible {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledLeadName = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledLeadMeta = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

type WholesalerMapContentProps = {
  countryOptions: SelectOption<string | null>[];
  featureCollection: WholesalerMapFeatureCollection;
  hasActiveFilters: boolean;
  hasWholesalerRelation: boolean;
  isLoading: boolean;
  loadError: Error | null;
  ownerOptions: SelectOption<string | null>[];
  postcodeOptions: SelectOption<string | null>[];
  selectedCountry: string | null;
  selectedOwnerId: string | null;
  selectedPostcode: string | null;
  selectedState: string | null;
  stateOptions: SelectOption<string | null>[];
  totalCompanyCount: number;
  onCompanySelect: (companyId: string) => void;
  onCountryChange: (country: string | null) => void;
  onOwnerChange: (ownerId: string | null) => void;
  onPostcodeChange: (postcode: string | null) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  onStateChange: (state: string | null) => void;
};

export const WholesalerMapContent = ({
  countryOptions,
  featureCollection,
  hasActiveFilters,
  hasWholesalerRelation,
  isLoading,
  loadError,
  ownerOptions,
  postcodeOptions,
  selectedCountry,
  selectedOwnerId,
  selectedPostcode,
  selectedState,
  stateOptions,
  totalCompanyCount,
  onCompanySelect,
  onCountryChange,
  onOwnerChange,
  onPostcodeChange,
  onResetFilters,
  onRetry,
  onStateChange,
}: WholesalerMapContentProps) => {
  const { t } = useLingui();

  if (isLoading) {
    return (
      <StyledState role="status">{t`Loading lead locations…`}</StyledState>
    );
  }

  if (loadError !== null) {
    return (
      <StyledState role="alert">
        <span>{t`Lead locations could not be loaded.`}</span>
        <LightButton title={t`Try again`} onClick={onRetry} />
      </StyledState>
    );
  }

  const mappedLeadCount = featureCollection.features.length;
  const unmappedEmptyState = (
    <StyledState>
      <strong>{t`No mapped leads`}</strong>
      <span>
        {t`Add latitude and longitude to a company address to show it here.`}
      </span>
    </StyledState>
  );
  const filteredEmptyState = (
    <StyledState>
      <strong>{t`No mapped leads match these filters`}</strong>
      <span>{t`Clear the filters to see every mapped company.`}</span>
    </StyledState>
  );

  if (mappedLeadCount === 0 && !hasActiveFilters) {
    return unmappedEmptyState;
  }

  return (
    <StyledContent>
      <StyledToolbar>
        <StyledMappedCount data-testid="wholesaler-map-located-count">
          {plural(mappedLeadCount, {
            one: '# mapped lead',
            other: '# mapped leads',
          })}
          {mappedLeadCount < totalCompanyCount
            ? t` of ${totalCompanyCount.toLocaleString()} companies`
            : ''}
        </StyledMappedCount>
        <WholesalerMapFilters
          countryOptions={countryOptions}
          hasActiveFilters={hasActiveFilters}
          hasWholesalerRelation={hasWholesalerRelation}
          onCountryChange={onCountryChange}
          onOwnerChange={onOwnerChange}
          onPostcodeChange={onPostcodeChange}
          onResetFilters={onResetFilters}
          onStateChange={onStateChange}
          ownerOptions={ownerOptions}
          postcodeOptions={postcodeOptions}
          selectedCountry={selectedCountry}
          selectedOwnerId={selectedOwnerId}
          selectedPostcode={selectedPostcode}
          selectedState={selectedState}
          stateOptions={stateOptions}
        />
      </StyledToolbar>
      {mappedLeadCount === 0 ? (
        filteredEmptyState
      ) : (
        <StyledMapAndList>
          <WholesalerCoverageMap
            featureCollection={featureCollection}
            onCompanySelect={onCompanySelect}
          />
          <StyledLeadList aria-label={t`Mapped leads`}>
            <StyledLeadListHeading>{t`Mapped leads`}</StyledLeadListHeading>
            <StyledLeadListItems>
              {featureCollection.features.map(({ properties }) => (
                <li key={properties.companyId}>
                  <StyledLeadButton
                    onClick={() => onCompanySelect(properties.companyId)}
                    type="button"
                  >
                    <StyledLeadName>{properties.companyName}</StyledLeadName>
                    <StyledLeadMeta>
                      {properties.locationLabel || t`Location available`}
                      {' · '}
                      {properties.ownerName}
                    </StyledLeadMeta>
                  </StyledLeadButton>
                </li>
              ))}
            </StyledLeadListItems>
          </StyledLeadList>
        </StyledMapAndList>
      )}
    </StyledContent>
  );
};
