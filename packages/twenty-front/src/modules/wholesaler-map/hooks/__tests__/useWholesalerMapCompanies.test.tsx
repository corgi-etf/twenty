import { renderHook, waitFor } from '@testing-library/react';

import { WHOLESALER_MAP_PAGE_SIZE } from '@/wholesaler-map/constants/WholesalerMapDataContract';
import { useWholesalerMapCompanies } from '@/wholesaler-map/hooks/useWholesalerMapCompanies';

const mockUseFindManyRecords = jest.fn();
const mockUseWholesalerMapAccess = jest.fn();
const mockFetchMoreRecords = jest.fn().mockResolvedValue({ data: {} });

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (args: unknown) => mockUseFindManyRecords(args),
}));
jest.mock('@/wholesaler-map/hooks/useWholesalerMapAccess', () => ({
  useWholesalerMapAccess: () => mockUseWholesalerMapAccess(),
}));

describe('useWholesalerMapCompanies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWholesalerMapAccess.mockReturnValue({
      canViewMap: true,
      hasWholesalerRelation: true,
      recordGqlFields: {
        id: true,
        name: true,
        address: true,
        historicalOwner: { id: true, name: true },
      },
      objectMetadataItem: { id: 'company-metadata-id' } as never,
    });
    mockUseFindManyRecords.mockReturnValue({
      records: [],
      loading: false,
      error: undefined,
      hasNextPage: true,
      fetchMoreRecords: mockFetchMoreRecords,
      totalCount: 400,
    } as never);
  });

  it('uses a bounded permission-aware Company query', () => {
    renderHook(() => useWholesalerMapCompanies());

    expect(mockUseFindManyRecords).toHaveBeenCalledWith({
      objectNameSingular: 'company',
      recordGqlFields: {
        id: true,
        name: true,
        address: true,
        historicalOwner: { id: true, name: true },
      },
      limit: WHOLESALER_MAP_PAGE_SIZE,
      skip: false,
    });
  });

  it('loads the next page until the query reports completion', async () => {
    const { rerender } = renderHook(() => useWholesalerMapCompanies());

    await waitFor(() => expect(mockFetchMoreRecords).toHaveBeenCalledTimes(1));

    mockUseFindManyRecords.mockReturnValue({
      records: [{ id: 'company-1' }],
      loading: false,
      error: undefined,
      hasNextPage: false,
      fetchMoreRecords: mockFetchMoreRecords,
      totalCount: 1,
    } as never);
    rerender();

    await waitFor(() => expect(mockFetchMoreRecords).toHaveBeenCalledTimes(1));
  });

  it('does not query or paginate without map read access', () => {
    mockUseWholesalerMapAccess.mockReturnValue({
      canViewMap: false,
      hasWholesalerRelation: false,
      recordGqlFields: {},
      objectMetadataItem: { id: 'company-metadata-id' } as never,
    });

    renderHook(() => useWholesalerMapCompanies());

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(mockFetchMoreRecords).not.toHaveBeenCalled();
  });
});
