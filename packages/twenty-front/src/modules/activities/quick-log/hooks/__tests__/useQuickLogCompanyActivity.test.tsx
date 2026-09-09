import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import { useQuickLogCompanyActivity } from '@/activities/quick-log/hooks/useQuickLogCompanyActivity';

const mockCreateOneRecord = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockUseFindManyRecords = jest.fn();

let mockCurrentUserEmail = 'BDR@CORGI.COM';
let mockWholesalers = [{ id: 'wholesaler-1', email: 'bdr@corgi.com' }];

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ userEmail: mockCurrentUserEmail }),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (args: { objectNameSingular: string }) =>
    mockUseFindManyRecords(args),
}));

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreateOneRecord }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

describe('useQuickLogCompanyActivity', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserEmail = 'BDR@CORGI.COM';
    mockWholesalers = [{ id: 'wholesaler-1', email: 'bdr@corgi.com' }];
    mockUseFindManyRecords.mockImplementation(
      ({ objectNameSingular }: { objectNameSingular: string }) =>
        objectNameSingular === 'wholesaler'
          ? { records: mockWholesalers, loading: false, error: undefined }
          : {
              records: [
                {
                  id: 'person-1',
                  name: { firstName: 'Alex', lastName: 'Morgan' },
                },
              ],
              loading: false,
              error: undefined,
            },
    );
    mockCreateOneRecord.mockResolvedValue({ id: 'activity-1' });
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T15:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates an attributed Outreach Activity from the quick-log values', async () => {
    const { result } = renderHook(
      () => useQuickLogCompanyActivity({ companyId: 'company-1' }),
      { wrapper: Wrapper },
    );

    expect(result.current.contactOptions).toEqual([
      { value: 'person-1', label: 'Alex Morgan' },
    ]);
    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'wholesaler',
        filter: { email: { eq: 'bdr@corgi.com' } },
      }),
    );

    await act(async () => {
      await result.current.submitActivity({
        activityType: 'phone_call',
        outcome: 'left_voicemail',
        notes: ' Call again next week. ',
        contactId: 'person-1',
        followUpDate: '2026-09-16',
      });
    });

    expect(mockCreateOneRecord).toHaveBeenCalledWith({
      name: 'Phone call · Left voicemail',
      companyId: 'company-1',
      wholesalerId: 'wholesaler-1',
      contactId: 'person-1',
      activityType: 'phone_call',
      outcome: 'left_voicemail',
      occurredAt: '2026-09-09T15:30:00.000Z',
      notes: 'Call again next week.',
      followUpDate: '2026-09-16',
    });
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message: 'Follow-up logged.',
    });
  });

  it('refuses to guess ownership when no wholesaler matches', async () => {
    mockWholesalers = [];
    const { result } = renderHook(
      () => useQuickLogCompanyActivity({ companyId: 'company-1' }),
      { wrapper: Wrapper },
    );

    expect(result.current.ownershipError).toBe(
      'No wholesaler profile is linked to your email.',
    );

    await act(async () => {
      await result.current.submitActivity({
        activityType: 'email',
        outcome: 'no_response',
        notes: '',
        contactId: null,
        followUpDate: '',
      });
    });

    expect(mockCreateOneRecord).not.toHaveBeenCalled();
    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'No wholesaler profile is linked to your email.',
    });
  });

  it('rejects a wildcard lookalike instead of guessing ownership', async () => {
    mockCurrentUserEmail = 'sales_ops@corgi.com';
    mockWholesalers = [
      { id: 'wrong-wholesaler', email: 'salesXops@corgi.com' },
    ];
    const { result } = renderHook(
      () => useQuickLogCompanyActivity({ companyId: 'company-1' }),
      { wrapper: Wrapper },
    );

    expect(result.current.ownershipError).toBe(
      'No wholesaler profile is linked to your email.',
    );

    await act(async () => {
      await result.current.submitActivity({
        activityType: 'phone_call',
        outcome: 'connected',
        notes: '',
        contactId: null,
        followUpDate: '',
      });
    });

    expect(mockCreateOneRecord).not.toHaveBeenCalled();
  });
});
