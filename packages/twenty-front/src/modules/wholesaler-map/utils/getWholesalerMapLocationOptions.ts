import { type SelectOption } from 'twenty-ui/input';

import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';
import {
  formatWholesalerMapLocationOption,
  normalizeWholesalerMapFilterValue,
} from '@/wholesaler-map/utils/normalizeWholesalerMapFilterValue';

type LocationOptions = {
  countryOptions: SelectOption<string | null>[];
  postcodeOptions: SelectOption<string | null>[];
  stateOptions: SelectOption<string | null>[];
};

const DOMESTIC_COUNTRY_VALUES = new Set([
  'US',
  'USA',
  'UNITED STATES',
  'UNITED STATES OF AMERICA',
]);

const toSortedOptions = (values: Array<string | null | undefined>) => {
  const labelsByNormalizedValue = new Map<string, string>();

  for (const value of values) {
    const normalizedValue = normalizeWholesalerMapFilterValue(value);

    if (
      normalizedValue === '' ||
      labelsByNormalizedValue.has(normalizedValue)
    ) {
      continue;
    }

    labelsByNormalizedValue.set(
      normalizedValue,
      formatWholesalerMapLocationOption(value),
    );
  }

  return [...labelsByNormalizedValue.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

const toCountryOptions = (values: Array<string | null | undefined>) =>
  toSortedOptions(values).sort((left, right) => {
    const leftIsDomestic = DOMESTIC_COUNTRY_VALUES.has(left.value);
    const rightIsDomestic = DOMESTIC_COUNTRY_VALUES.has(right.value);

    if (leftIsDomestic === rightIsDomestic) {
      return left.label.localeCompare(right.label);
    }

    return leftIsDomestic ? -1 : 1;
  });

export const getWholesalerMapLocationOptions = (
  companies: WholesalerMapCompany[],
): LocationOptions => ({
  countryOptions: toCountryOptions(
    companies.map(({ address }) => address?.addressCountry),
  ),
  postcodeOptions: toSortedOptions(
    companies.map(({ address }) => address?.addressPostcode),
  ),
  stateOptions: toSortedOptions(
    companies.map(({ address }) => address?.addressState),
  ),
});
