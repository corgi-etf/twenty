import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { LightButton, type SelectOption } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { Select } from '@/ui/input/components/Select';

const StyledFilters = styled.div`
  align-items: flex-end;
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    justify-content: flex-start;
    width: 100%;
  }
`;

const StyledFilter = styled.div`
  flex: 1 1 140px;
  max-width: 220px;
  min-width: 140px;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    max-width: none;
  }
`;

type WholesalerMapFiltersProps = {
  countryOptions: SelectOption<string | null>[];
  hasActiveFilters: boolean;
  hasWholesalerRelation: boolean;
  ownerOptions: SelectOption<string | null>[];
  postcodeOptions: SelectOption<string | null>[];
  selectedCountry: string | null;
  selectedOwnerId: string | null;
  selectedPostcode: string | null;
  selectedState: string | null;
  stateOptions: SelectOption<string | null>[];
  onCountryChange: (country: string | null) => void;
  onOwnerChange: (ownerId: string | null) => void;
  onPostcodeChange: (postcode: string | null) => void;
  onResetFilters: () => void;
  onStateChange: (state: string | null) => void;
};

export const WholesalerMapFilters = ({
  countryOptions,
  hasActiveFilters,
  hasWholesalerRelation,
  ownerOptions,
  postcodeOptions,
  selectedCountry,
  selectedOwnerId,
  selectedPostcode,
  selectedState,
  stateOptions,
  onCountryChange,
  onOwnerChange,
  onPostcodeChange,
  onResetFilters,
  onStateChange,
}: WholesalerMapFiltersProps) => {
  const { t } = useLingui();

  return (
    <StyledFilters aria-label={t`Territory filters`}>
      <StyledFilter>
        <Select<string | null>
          dropdownId="wholesaler-map-state-filter"
          fullWidth
          label={t`State`}
          onChange={onStateChange}
          options={stateOptions}
          pinnedOption={{ label: t`All states`, value: null }}
          value={selectedState}
          withSearchInput
        />
      </StyledFilter>
      <StyledFilter>
        <Select<string | null>
          dropdownId="wholesaler-map-postcode-filter"
          fullWidth
          label={t`ZIP code`}
          onChange={onPostcodeChange}
          options={postcodeOptions}
          pinnedOption={{ label: t`All ZIP codes`, value: null }}
          value={selectedPostcode}
          withSearchInput
        />
      </StyledFilter>
      <StyledFilter>
        <Select<string | null>
          dropdownId="wholesaler-map-country-filter"
          fullWidth
          label={t`Country`}
          onChange={onCountryChange}
          options={countryOptions}
          pinnedOption={{ label: t`All countries`, value: null }}
          value={selectedCountry}
          withSearchInput
        />
      </StyledFilter>
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
      {hasActiveFilters && (
        <LightButton title={t`Clear filters`} onClick={onResetFilters} />
      )}
    </StyledFilters>
  );
};
