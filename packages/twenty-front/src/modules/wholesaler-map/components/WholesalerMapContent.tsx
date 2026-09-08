import { styled } from '@linaria/react';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { LightButton, type SelectOption } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { Select } from '@/ui/input/components/Select';
import { WholesalerCoverageMap } from '@/wholesaler-map/components/WholesalerCoverageMap';
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
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
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

const StyledFilter = styled.div`
  min-width: 220px;
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
  featureCollection: WholesalerMapFeatureCollection;
  hasWholesalerRelation: boolean;
  isLoading: boolean;
  loadError: Error | null;
  ownerOptions: SelectOption<string | null>[];
  selectedOwnerId: string | null;
  totalCompanyCount: number;
  onCompanySelect: (companyId: string) => void;
  onOwnerChange: (ownerId: string | null) => void;
  onRetry: () => void;
};

export const WholesalerMapContent = ({
  featureCollection,
  hasWholesalerRelation,
  isLoading,
  loadError,
  ownerOptions,
  selectedOwnerId,
  totalCompanyCount,
  onCompanySelect,
  onOwnerChange,
  onRetry,
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

  if (mappedLeadCount === 0) {
    return (
      <StyledState>
        <strong>{t`No mapped leads`}</strong>
        <span>
          {t`Add latitude and longitude to a company address to show it here.`}
        </span>
      </StyledState>
    );
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
        {hasWholesalerRelation && (
          <StyledFilter>
            <Select<string | null>
              dropdownId="wholesaler-map-owner-filter"
              fullWidth
              label={t`Wholesaler`}
              onChange={onOwnerChange}
              options={ownerOptions}
              pinnedOption={{ label: t`All wholesalers`, value: null }}
              value={selectedOwnerId}
              withSearchInput
            />
          </StyledFilter>
        )}
      </StyledToolbar>
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
    </StyledContent>
  );
};
