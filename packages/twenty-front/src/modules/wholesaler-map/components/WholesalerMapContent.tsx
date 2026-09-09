import { styled } from '@linaria/react';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { LightButton, type SelectOption } from 'twenty-ui/input';
import { IconSearch } from 'twenty-ui/icon';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { TextInput } from '@/ui/input/components/TextInput';
import { WholesalerCoverageMap } from '@/wholesaler-map/components/WholesalerCoverageMap';
import { WholesalerMapCompanyDetails } from '@/wholesaler-map/components/WholesalerMapCompanyDetails';
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
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  min-height: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(360px, 55vh) minmax(240px, auto);
    overflow: auto;
  }
`;

const StyledLeadSidebar = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-left: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    border-left: 0;
    border-top: 1px solid ${themeCssVariables.border.color.medium};
  }
`;

const StyledLeadListHeading = styled.h2`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledSearch = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledLeadListItems = styled.ol`
  flex: 1;
  list-style: none;
  margin: 0;
  min-height: 0;
  overflow: auto;
  padding: 0;
`;

const StyledLeadButton = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.light
      : 'transparent'};
  border: 0;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  border-left: 3px solid
    ${({ isSelected }) =>
      isSelected ? themeCssVariables.border.color.strong : 'transparent'};
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

const StyledNoSearchResults = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[4]};
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
  onCompanyOpen: (companyId: string) => void;
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
  onCompanyOpen,
  onCountryChange,
  onOwnerChange,
  onPostcodeChange,
  onResetFilters,
  onRetry,
  onStateChange,
}: WholesalerMapContentProps) => {
  const { t } = useLingui();
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const normalizedSearch = companySearch.trim().toLocaleLowerCase();
  const visibleFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features:
        normalizedSearch === ''
          ? featureCollection.features
          : featureCollection.features.filter(({ properties }) =>
              [
                properties.companyName,
                properties.firmPhone,
                properties.fullAddress,
                properties.ownerName,
              ].some((value) =>
                value.toLocaleLowerCase().includes(normalizedSearch),
              ),
            ),
    }),
    [featureCollection, normalizedSearch],
  );
  const selectedFeature =
    featureCollection.features.find(
      ({ properties }) => properties.companyId === selectedCompanyId,
    ) ?? null;

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
            featureCollection={visibleFeatureCollection}
            onCompanySelect={setSelectedCompanyId}
            selectedCompanyId={selectedCompanyId}
          />
          <StyledLeadSidebar aria-label={t`Mapped leads`}>
            <WholesalerMapCompanyDetails
              feature={selectedFeature}
              onCompanyOpen={onCompanyOpen}
            />
            <StyledSearch>
              <TextInput
                LeftIcon={IconSearch}
                fullWidth
                label={t`Find a company`}
                onChange={setCompanySearch}
                placeholder={t`Search company, phone, location, or owner`}
                sizeVariant="sm"
                value={companySearch}
              />
            </StyledSearch>
            <StyledLeadListHeading>
              {plural(visibleFeatureCollection.features.length, {
                one: '# company',
                other: '# companies',
              })}
            </StyledLeadListHeading>
            <StyledLeadListItems>
              {visibleFeatureCollection.features.map(({ properties }) => (
                <li key={properties.companyId}>
                  <StyledLeadButton
                    aria-pressed={selectedCompanyId === properties.companyId}
                    isSelected={selectedCompanyId === properties.companyId}
                    onClick={() => setSelectedCompanyId(properties.companyId)}
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
            {visibleFeatureCollection.features.length === 0 ? (
              <StyledNoSearchResults>
                {t`No companies match this search.`}
              </StyledNoSearchResults>
            ) : null}
          </StyledLeadSidebar>
        </StyledMapAndList>
      )}
    </StyledContent>
  );
};
