import { type SelectOption } from 'twenty-ui/input';

import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

export const getWholesalerMapOwnerOptions = (
  companies: WholesalerMapCompany[],
  unassignedLabel: string,
): SelectOption<string | null>[] => {
  const ownerNamesById = new Map<string, string>();
  let hasUnassignedCompany = false;

  for (const company of companies) {
    const owner = company.historicalOwner;

    if (owner === null || owner === undefined) {
      hasUnassignedCompany = true;
      continue;
    }

    ownerNamesById.set(owner.id, owner.name);
  }

  const ownerOptions = [...ownerNamesById.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return hasUnassignedCompany
    ? [...ownerOptions, { value: '', label: unassignedLabel }]
    : ownerOptions;
};
