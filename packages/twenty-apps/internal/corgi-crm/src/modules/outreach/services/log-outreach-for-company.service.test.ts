import { describe, expect, it, vi } from 'vitest';

import { logOutreachForCompany } from 'src/modules/outreach/services/log-outreach-for-company.service';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const ACTIVITY_ID = uuid('1');
const COMPANY_ID = uuid('2');
const WHOLESALER_ID = uuid('3');
const NOW = new Date('2026-09-10T16:30:00.000Z');

const repository = () => ({
  createActivity: vi.fn().mockResolvedValue({ id: ACTIVITY_ID }),
});

const input = {
  activityId: ACTIVITY_ID,
  companyId: COMPANY_ID,
  activityType: 'PHONE_CALL',
  outcome: 'connected',
};

describe('logOutreachForCompany', () => {
  it('writes one activity against the company the user already opened', async () => {
    const repo = repository();

    await expect(
      logOutreachForCompany({
        input: { ...input, notes: '  renewal chat  ' },
        wholesalerId: WHOLESALER_ID,
        now: NOW,
        repository: repo,
      }),
    ).resolves.toEqual({ status: 'logged', activityId: ACTIVITY_ID });

    expect(repo.createActivity).toHaveBeenCalledWith({
      id: ACTIVITY_ID,
      name: 'Phone call · Connected',
      companyId: COMPANY_ID,
      wholesalerId: WHOLESALER_ID,
      activityType: 'PHONE_CALL',
      outcome: 'connected',
      notes: 'renewal chat',
      occurredAt: '2026-09-10T16:30:00.000Z',
    });
  });

  it('omits notes entirely when they are blank rather than writing whitespace', async () => {
    const repo = repository();
    await logOutreachForCompany({
      input: { ...input, notes: '   ' },
      wholesalerId: WHOLESALER_ID,
      now: NOW,
      repository: repo,
    });
    expect(repo.createActivity).toHaveBeenCalledWith(
      expect.not.objectContaining({ notes: expect.anything() }),
    );
  });

  it.each([
    ['activity type', { activityType: 'cold_call' }, /unsupported activity type/i],
    ['lower-case activity type', { activityType: 'phone_call' }, /unsupported activity type/i],
    ['outcome', { outcome: 'maybe' }, /unsupported outcome/i],
    ['activity id', { activityId: 'not-a-uuid' }, /Activity ID must be a UUID/],
    ['company id', { companyId: 'not-a-uuid' }, /Company ID must be a UUID/],
  ])('rejects an invalid %s before writing anything', async (_n, override, message) => {
    const repo = repository();
    await expect(
      logOutreachForCompany({
        input: { ...input, ...override },
        wholesalerId: WHOLESALER_ID,
        now: NOW,
        repository: repo,
      }),
    ).rejects.toThrow(message);
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it('refuses an unresolved caller rather than writing an unowned activity', async () => {
    const repo = repository();
    await expect(
      logOutreachForCompany({
        input,
        wholesalerId: '',
        now: NOW,
        repository: repo,
      }),
    ).rejects.toThrow(/Wholesaler ID must be a UUID/);
    expect(repo.createActivity).not.toHaveBeenCalled();
  });
});
