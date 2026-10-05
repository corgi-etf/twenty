import { describe, expect, it, vi } from 'vitest';
import {
  reconcileLifecycle,
  allocationValidation,
  type LifecycleRecord,
} from './reconcile-lifecycle.service';
const allocation: LifecycleRecord = {
  id: 'a',
  companyId: 'c',
  updatedAt: '2026-10-05T12:00:00Z',
  ticker: 'BRK.B',
  amount: { amountMicros: 123000000, currencyCode: 'USD' },
  loggedAt: null,
};
const run = (
  record: LifecycleRecord,
  object: 'meetingBooking' | 'companyAllocation' = 'companyAllocation',
) => {
  const repository = {
    get: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockResolvedValue(true),
  };
  return {
    repository,
    result: reconcileLifecycle({
      object,
      id: record.id,
      eventAt: '2026-10-05T13:00:00Z',
      actorWorkspaceMemberId: 'actor',
      repository,
    }),
  };
};
describe('authoritative lifecycle evidence', () => {
  it('preserves full 64-bit string allocation micros without floating point conversion', () => {
    expect(
      allocationValidation({
        ...allocation,
        amount: { amountMicros: '9007199254740993', currencyCode: 'USD' },
      }),
    ).toBeNull();
  });
  it('logs a valid allocation once independently of its economic date', async () => {
    const { result, repository } = run(allocation);
    await result;
    expect(repository.update).toHaveBeenCalledWith(
      'companyAllocation',
      allocation,
      {
        loggedAt: '2026-10-05T13:00:00.000Z',
        loggedById: 'actor',
        allocationValidationMessage: null,
      },
    );
    const replay = run({
      ...allocation,
      loggedAt: '2026-10-05T13:00:00.000Z',
      validationMessage: null,
    });
    expect(await replay.result).toEqual({ status: 'unchanged' });
    expect(replay.repository.update).not.toHaveBeenCalled();
  });
  it.each([
    { ...allocation, ticker: '' },
    { ...allocation, companyId: null },
    { ...allocation, amount: { amountMicros: 0, currencyCode: 'USD' } },
    { ...allocation, contactId: 'p', contactCompanyId: 'other' },
    { ...allocation, meetingId: 'm', meetingCompanyId: 'other' },
  ])('excludes incomplete or incompatible allocations', async (record) => {
    expect(allocationValidation(record)).not.toBeNull();
    const { repository, result } = run(record);
    expect(await result).toMatchObject({ status: 'invalid' });
    expect(repository.update.mock.calls[0]?.[2]).not.toHaveProperty('loggedAt');
  });
  it('does not infer actual meeting time from an edit timestamp', async () => {
    const { repository, result } = run(
      { ...allocation, status: 'COMPLETED', wholesalerId: 'w' },
      'meetingBooking',
    );
    expect(await result).toMatchObject({ status: 'invalid' });
    expect(repository.update.mock.calls[0]?.[2]).not.toHaveProperty(
      'heldRecordedAt',
    );
  });
  it('keeps actual held time separate from entry time and captures taker once', async () => {
    const record = {
      ...allocation,
      status: 'COMPLETED',
      wholesalerId: 'w',
      heldAt: '2026-10-01T10:00:00Z',
    };
    const { repository, result } = run(record, 'meetingBooking');
    await result;
    expect(repository.update.mock.calls[0]?.[2]).toEqual({
      heldRecordedAt: '2026-10-05T13:00:00.000Z',
      takenById: 'actor',
      bookingValidationMessage: null,
    });
    const replay = run(
      {
        ...record,
        heldRecordedAt: '2026-10-05T13:00:00.000Z',
        validationMessage: null,
      },
      'meetingBooking',
    );
    expect(await replay.result).toEqual({ status: 'unchanged' });
  });
});
