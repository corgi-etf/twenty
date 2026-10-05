import { type ObjectRecordOperationBrowserEventDetail } from '@/browser-event/types/ObjectRecordOperationBrowserEventDetail';
import {
  getCorgiLocalCreationKey,
  reconcileCorgiCreationEvidence,
} from '@/corgi-crm/events/utils/corgiCreationEvidence';

const evidence = (object: string, input: Record<string, unknown>) =>
  ({
    source: 'local-mutation',
    objectMetadataItem: { nameSingular: object },
    operation: { type: 'create-one', createdRecord: { id: 'record' } },
    createInput: input,
  }) as ObjectRecordOperationBrowserEventDetail;
const allocation = (amountMicros: unknown, currencyCode: string = 'USD') =>
  evidence('companyAllocation', {
    companyId: 'company',
    ticker: 'ABC FLEXIBLE',
    amount: { amountMicros, currencyCode },
  });

describe('Meaningful local creation evidence', () => {
  it.each(['9007199254740993', '1', 1])(
    'accepts exact positive micros %s',
    (micros) => {
      expect(getCorgiLocalCreationKey(allocation(micros))).toBe(
        'companyAllocation:record',
      );
    },
  );
  it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, '0', '-1', '1.2', 'NaN'])(
    'rejects invalid initial micros %s',
    (micros) => {
      expect(getCorgiLocalCreationKey(allocation(micros))).toBeUndefined();
    },
  );
  it('requires company and currency before treating the save as a meaningful creation', () => {
    expect(getCorgiLocalCreationKey(allocation('1', 'usd'))).toBeUndefined();
    expect(
      getCorgiLocalCreationKey(
        evidence('companyAllocation', {
          ticker: 'ABC',
          amount: { amountMicros: '1', currencyCode: 'USD' },
        }),
      ),
    ).toBeUndefined();
  });
  it('does not turn a saved draft into creation evidence for a later booking action', () => {
    const input = {
      companyId: 'company',
      wholesalerId: 'owner',
      scheduledAt: '2026-10-05T15:00:00Z',
    };
    expect(
      getCorgiLocalCreationKey(
        evidence('meetingBooking', { ...input, status: 'DRAFT' }),
      ),
    ).toBeUndefined();
    expect(
      getCorgiLocalCreationKey(
        evidence('meetingBooking', { ...input, status: 'BOOKED' }),
      ),
    ).toBe('meetingBooking:record');
    expect(
      getCorgiLocalCreationKey(
        evidence('meetingBooking', { ...input, status: 'COMPLETED' }),
      ),
    ).toBeUndefined();
  });
  it('consumes a pair once and bounds retained identifiers without storing record data', () => {
    const initial = { localKeys: [], validKeys: [], consumedKeys: [] };
    const local = reconcileCorgiCreationEvidence(initial, ['key']);
    expect(local.shouldCelebrate).toBe(false);
    const paired = reconcileCorgiCreationEvidence(local.state, [], ['key']);
    expect(paired.shouldCelebrate).toBe(true);
    expect(
      reconcileCorgiCreationEvidence(paired.state, ['key'], ['key'])
        .shouldCelebrate,
    ).toBe(false);
    const bounded = reconcileCorgiCreationEvidence(
      initial,
      Array.from({ length: 1000 }, (_, index) => `key-${index}`),
    );
    expect(bounded.state.localKeys).toHaveLength(500);
  });
});
