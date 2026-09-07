import { getWholesalerMapAccess } from '@/wholesaler-map/utils/getWholesalerMapAccess';

describe('getWholesalerMapAccess', () => {
  it('allows the map only when Company records, names, and addresses are readable', () => {
    expect(
      getWholesalerMapAccess({
        canReadCompanyRecords: true,
        readableCompanyFieldNames: ['id', 'name', 'address'],
      }),
    ).toEqual({
      canViewMap: true,
      hasWholesalerRelation: false,
      recordGqlFields: {
        id: true,
        name: true,
        address: true,
      },
    });
  });

  it.each([
    {
      canReadCompanyRecords: false,
      readableCompanyFieldNames: ['id', 'name', 'address'],
    },
    {
      canReadCompanyRecords: true,
      readableCompanyFieldNames: ['id', 'name'],
    },
    {
      canReadCompanyRecords: true,
      readableCompanyFieldNames: ['id', 'address'],
    },
  ])('denies the map when required data is not readable %#', (input) => {
    expect(getWholesalerMapAccess(input).canViewMap).toBe(false);
  });

  it('requests historical owner details only when that relation is readable', () => {
    expect(
      getWholesalerMapAccess({
        canReadCompanyRecords: true,
        readableCompanyFieldNames: ['id', 'name', 'address', 'historicalOwner'],
      }),
    ).toEqual({
      canViewMap: true,
      hasWholesalerRelation: true,
      recordGqlFields: {
        id: true,
        name: true,
        address: true,
        historicalOwner: {
          id: true,
          name: true,
        },
      },
    });
  });
});
