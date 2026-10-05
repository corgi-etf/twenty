import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { act, renderHook } from '@testing-library/react';

import { CoreObjectNameSingular } from 'twenty-shared/types';
import {
  query,
  responseData,
} from '@/object-record/hooks/__mocks__/useCreateOneRecord';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const PERSON_ID = 'a7286b9a-c039-4a89-9567-2dfa7953cda9';

jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: jest.fn(() => 'a7286b9a-c039-4a89-9567-2dfa7953cda9'),
}));

const input = { name: { firstName: 'John', lastName: 'Doe' } };

jest.mock('@/object-record/hooks/useRefetchAggregateQueries');
jest.mock('@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent');
const mockRefetchAggregateQueries = jest.fn();
(useRefetchAggregateQueries as jest.Mock).mockReturnValue({
  refetchAggregateQueries: mockRefetchAggregateQueries,
});

const mocks = [
  {
    request: {
      query,
      variables: { input: { ...input, id: PERSON_ID } },
    },
    result: jest.fn(() => ({
      data: {
        createPerson: { ...responseData, ...input, id: PERSON_ID },
      },
    })),
  },
];

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: mocks,
});

describe('useCreateOneRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('works as expected', async () => {
    const { result } = renderHook(
      () =>
        useCreateOneRecord({
          objectNameSingular: CoreObjectNameSingular.Person,
        }),
      {
        wrapper: Wrapper,
      },
    );

    await act(async () => {
      const res = await result.current.createOneRecord(input);
      expect(res).toBeDefined();
      expect(res).toHaveProperty('id', PERSON_ID);
    });

    expect(dispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'local-mutation',
        createInput: { ...input, id: PERSON_ID },
      }),
    );
    expect(mocks[0].result).toHaveBeenCalled();
    expect(mockRefetchAggregateQueries).toHaveBeenCalledTimes(1);
  });
  it.each(['rejected', 'empty-response'])(
    'does not emit local creation evidence for %s',
    async (failure) => {
      const failedWrapper = getJestMetadataAndApolloMocksWrapper({
        apolloMocks: [
          {
            request: mocks[0].request,
            ...(failure === 'rejected'
              ? { error: new Error('Save failed') }
              : { result: { data: { createPerson: null } } }),
          },
        ],
      });
      const { result } = renderHook(
        () =>
          useCreateOneRecord({
            objectNameSingular: CoreObjectNameSingular.Person,
          }),
        { wrapper: failedWrapper },
      );
      await act(async () => {
        await expect(result.current.createOneRecord(input)).rejects.toThrow();
      });
      expect(dispatchObjectRecordOperationBrowserEvent).not.toHaveBeenCalled();
    },
  );
});
