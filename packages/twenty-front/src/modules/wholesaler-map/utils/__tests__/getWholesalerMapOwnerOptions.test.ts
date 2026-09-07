import { getWholesalerMapOwnerOptions } from '@/wholesaler-map/utils/getWholesalerMapOwnerOptions';
import { type WholesalerMapCompany } from '@/wholesaler-map/types/WholesalerMapCompany';

describe('getWholesalerMapOwnerOptions', () => {
  it('deduplicates and sorts wholesalers while including unassigned leads', () => {
    const companies = [
      { historicalOwner: { id: 'owner-2', name: 'Zoe Kim' } },
      { historicalOwner: { id: 'owner-1', name: 'Alex Morgan' } },
      { historicalOwner: { id: 'owner-1', name: 'Alex Morgan' } },
      { historicalOwner: null },
    ] as WholesalerMapCompany[];

    expect(getWholesalerMapOwnerOptions(companies, 'Unassigned')).toEqual([
      { value: 'owner-1', label: 'Alex Morgan' },
      { value: 'owner-2', label: 'Zoe Kim' },
      { value: '', label: 'Unassigned' },
    ]);
  });
});
