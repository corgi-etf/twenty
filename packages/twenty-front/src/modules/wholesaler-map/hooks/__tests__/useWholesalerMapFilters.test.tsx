import { act, renderHook } from '@testing-library/react';

import { useWholesalerMapFilters } from '@/wholesaler-map/hooks/useWholesalerMapFilters';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

const companies = [
  {
    id: 'company-1',
    name: 'Northstar Capital',
    address: {
      addressCity: 'Chicago',
      addressState: 'IL',
      addressPostcode: '60601',
      addressCountry: 'US',
      addressLat: 41.8781,
      addressLng: -87.6298,
    },
    historicalOwner: { id: 'owner-1', name: 'Alex Morgan' },
  },
] as WholesalerMapCompany[];

describe('useWholesalerMapFilters', () => {
  it('combines territory filters and resets every selection', () => {
    const { result } = renderHook(() =>
      useWholesalerMapFilters({
        companies,
        ownerColors: ['blue'],
        unassignedOwnerColor: 'gray',
        unassignedOwnerName: 'Unassigned',
      }),
    );

    act(() => {
      result.current.setSelectedState('IL');
      result.current.setSelectedPostcode('60601');
      result.current.setSelectedCountry('US');
      result.current.setSelectedOwnerId('owner-1');
    });

    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.featureCollection.features).toHaveLength(1);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters).toEqual({
      country: null,
      ownerId: null,
      postcode: null,
      state: null,
    });
    expect(result.current.hasActiveFilters).toBe(false);
  });
});
