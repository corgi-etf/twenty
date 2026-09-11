import { describe, expect, it, vi } from 'vitest';

import {
  logOutreach,
} from 'src/modules/outreach/services/log-outreach.service';
import { type OutreachRepository } from 'src/modules/outreach/types';

const repository = (): OutreachRepository => ({
  findCompanies: vi.fn().mockResolvedValue([{ id: 'company-1', name: 'Acme' }]),
  findContacts: vi.fn().mockResolvedValue([]),
  createActivity: vi.fn().mockResolvedValue({ id: 'activity-1' }),
  listActivities: vi.fn().mockResolvedValue([]),
});

describe('logOutreach', () => {
  it('writes one activity linked to the authenticated wholesaler', async () => {
    const repo = repository();

    await expect(
      logOutreach({
        input: {
          activityId: 'activity-from-update-42',
          activityType: 'PHONE_CALL',
          companyQuery: 'Acme',
          outcome: 'connected',
          notes: 'renewal chat',
        },
        wholesalerId: 'wholesaler-1',
        now: new Date('2026-09-09T16:30:00.000Z'),
        repository: repo,
      }),
    ).resolves.toEqual({
      status: 'logged',
      activityId: 'activity-1',
      companyName: 'Acme',
    });
    expect(repo.createActivity).toHaveBeenCalledWith({
      id: 'activity-from-update-42',
      name: 'Phone call · Connected',
      companyId: 'company-1',
      wholesalerId: 'wholesaler-1',
      activityType: 'PHONE_CALL',
      outcome: 'connected',
      notes: 'renewal chat',
      occurredAt: '2026-09-09T16:30:00.000Z',
    });
  });

  it('fails closed without writing when a company lookup is ambiguous', async () => {
    const repo = repository();
    vi.mocked(repo.findCompanies).mockResolvedValue([
      { id: 'company-1', name: 'Acme Capital' },
      { id: 'company-2', name: 'Acme Holdings' },
    ]);

    await expect(
      logOutreach({
        input: {
          activityId: 'activity-from-update-42',
          activityType: 'PHONE_CALL',
          companyQuery: 'Acme',
          outcome: 'connected',
        },
        wholesalerId: 'wholesaler-1',
        now: new Date('2026-09-09T16:30:00.000Z'),
        repository: repo,
      }),
    ).resolves.toEqual({
      status: 'ambiguous_company',
      matches: [
        { id: 'company-1', name: 'Acme Capital' },
        { id: 'company-2', name: 'Acme Holdings' },
      ],
    });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it('rejects unsupported domain taxonomy before any CRM lookup', async () => {
    const repo = repository();
    await expect(
      logOutreach({
        input: {
          activityId: 'activity-from-update-42',
          activityType: 'cold_call' as never,
          companyQuery: 'Acme',
          outcome: 'maybe' as never,
        },
        wholesalerId: 'wholesaler-1',
        now: new Date('2026-09-09T16:30:00.000Z'),
        repository: repo,
      }),
    ).rejects.toThrow(/unsupported activity type/i);
    expect(repo.findCompanies).not.toHaveBeenCalled();
  });
});
