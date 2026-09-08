import { getWholesalerMapAccess } from '@/wholesaler-map/utils/getWholesalerMapAccess';

describe('getWholesalerMapAccess', () => {
  it('allows the map only when Company records, names, and addresses are readable', () => {
    expect(
      getWholesalerMapAccess({
        canReadCompanyRecords: true,
        canReadWholesalerRecords: false,
        readableCompanyFieldNames: ['id', 'name', 'address'],
        readableWholesalerFieldNames: [],
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
      canReadWholesalerRecords: false,
      readableCompanyFieldNames: ['id', 'name', 'address'],
      readableWholesalerFieldNames: [],
    },
    {
      canReadCompanyRecords: true,
      canReadWholesalerRecords: false,
      readableCompanyFieldNames: ['id', 'name'],
      readableWholesalerFieldNames: [],
    },
    {
      canReadCompanyRecords: true,
      canReadWholesalerRecords: false,
      readableCompanyFieldNames: ['id', 'address'],
      readableWholesalerFieldNames: [],
    },
  ])('denies the map when required data is not readable %#', (input) => {
    expect(getWholesalerMapAccess(input).canViewMap).toBe(false);
  });

  it('requests historical owner details only when that relation is readable', () => {
    expect(
      getWholesalerMapAccess({
        canReadCompanyRecords: true,
        canReadWholesalerRecords: true,
        readableCompanyFieldNames: ['id', 'name', 'address', 'historicalOwner'],
        readableWholesalerFieldNames: ['id', 'name'],
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

  it.each([
    {
      canReadWholesalerRecords: false,
      readableWholesalerFieldNames: ['id', 'name'],
    },
    {
      canReadWholesalerRecords: true,
      readableWholesalerFieldNames: ['id'],
    },
  ])(
    'omits the owner relation when related record access is restricted %#',
    ({ canReadWholesalerRecords, readableWholesalerFieldNames }) => {
      expect(
        getWholesalerMapAccess({
          canReadCompanyRecords: true,
          canReadWholesalerRecords,
          readableCompanyFieldNames: [
            'id',
            'name',
            'address',
            'historicalOwner',
          ],
          readableWholesalerFieldNames,
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
    },
  );
});
