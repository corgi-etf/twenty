import { describe, expect, it, vi } from 'vitest';

import {
  logOutreach,
  parseLogCommand,
} from 'src/modules/outreach/services/log-outreach.service';
import { type OutreachRepository } from 'src/modules/outreach/types';

const repository = (): OutreachRepository => ({
  findCompanies: vi.fn().mockResolvedValue([{ id: 'company-1', name: 'Acme' }]),
  findContacts: vi.fn().mockResolvedValue([]),
  createActivity: vi.fn().mockResolvedValue({ id: 'activity-1' }),
  listActivities: vi.fn().mockResolvedValue([]),
});

describe('parseLogCommand', () => {
  it('parses the fast pipe syntax', () => {
    expect(
      parseLogCommand('/log call | Acme Holdings | connected | renewal chat'),
    ).toEqual({
      activityType: 'call',
      companyQuery: 'Acme Holdings',
      outcome: 'connected',
      notes: 'renewal chat',
    });
  });

  it('parses explicit fields including an optional contact and follow-up date', () => {
    expect(
      parseLogCommand(
        '/log type=meeting; company=Acme; contact=Jane Doe; outcome=interested; notes=Send deck; followup=2026-09-12',
      ),
    ).toEqual({
      activityType: 'meeting',
      companyQuery: 'Acme',
      contactQuery: 'Jane Doe',
      outcome: 'interested',
      notes: 'Send deck',
      followUpDate: '2026-09-12',
    });
  });
});

describe('logOutreach', () => {
  it('writes one activity linked to the authenticated wholesaler', async () => {
    const repo = repository();

    await expect(
      logOutreach({
        text: '/log call | Acme | connected | renewal chat',
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
      name: 'call · Acme · 2026-09-09T16:30:00.000Z',
      companyId: 'company-1',
      wholesalerId: 'wholesaler-1',
      activityType: 'call',
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
        text: '/log call | Acme | connected',
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
});
