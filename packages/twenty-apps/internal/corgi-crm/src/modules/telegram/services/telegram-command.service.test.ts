import { describe, expect, it, vi } from 'vitest';

import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import { getTelegramActivityId } from 'src/modules/telegram/services/telegram-identifiers.service';
import { type OutreachRepository } from 'src/modules/outreach/types';

const base = () => {
  const values = new Map<string, unknown>();
  values.set('telegram:user:101', {
    userId: '101',
    chatId: '101',
    workspaceMemberId: '11111111-1111-4111-8111-111111111111',
    wholesalerId: 'wholesaler-1',
    wholesalerName: 'Nash',
  });
  const store = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => values.delete(key)),
  };
  const repository: OutreachRepository = {
    findCompanies: vi.fn().mockResolvedValue([{ id: 'company-1', name: 'Acme' }]),
    findContacts: vi.fn().mockResolvedValue([]),
    createActivity: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    listActivities: vi.fn().mockResolvedValue([]),
  };
  return {
    values,
    store,
    repository,
    timeZone: 'America/Chicago',
    linkCodesJson: '{}',
    identity: {
      findWorkspaceMember: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        active: true,
      }),
      findWholesalers: vi.fn().mockResolvedValue([
        {
          id: 'wholesaler-1',
          name: 'Nash',
          workspaceMemberId: '11111111-1111-4111-8111-111111111111',
        },
      ]),
    },
    send: vi.fn().mockResolvedValue(undefined),
    onCrmCommitted: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-09-09T16:30:00.000Z'),
  };
};

const update = (text: string) => ({
  updateId: 42,
  userId: '101',
  chatId: '101',
  firstName: 'Nash',
  text,
  messageTimestamp: '2026-09-09T16:29:00.000Z',
});

describe('processTelegramCommand', () => {
  it('requires a linked CRM identity before reads or writes', async () => {
    const dependencies = base();
    dependencies.values.delete('telegram:user:101');

    await expect(
      processTelegramCommand(update('/log call | Acme | connected'), dependencies),
    ).resolves.toEqual({ status: 'not_linked' });
    expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Link your CRM identity first with /link CODE.',
    );
  });

  it('revalidates CRM ownership before every linked read or write', async () => {
    const writeDependencies = base();
    writeDependencies.identity.findWorkspaceMember.mockResolvedValue(null);

    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected'),
        writeDependencies,
      ),
    ).resolves.toEqual({ status: 'not_linked' });
    expect(writeDependencies.repository.createActivity).not.toHaveBeenCalled();

    const readDependencies = base();
    readDependencies.identity.findWholesalers.mockResolvedValue([
      {
        id: 'wholesaler-2',
        name: 'Reassigned',
        workspaceMemberId: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    await expect(
      processTelegramCommand(update('/today'), readDependencies),
    ).resolves.toEqual({ status: 'not_linked' });
    expect(readDependencies.repository.listActivities).not.toHaveBeenCalled();
  });

  it('logs the fast syntax and confirms the company', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected | renewal chat'),
        dependencies,
      ),
    ).resolves.toMatchObject({ status: 'logged', companyName: 'Acme' });
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Logged Acme. Use /today to review your day.',
    );
  });

  it('uses the immutable Telegram source time when processing crosses local midnight', async () => {
    const dependencies = base();
    dependencies.now = () => new Date('2026-09-10T05:01:00.000Z');

    await processTelegramCommand(
      {
        ...update('/log call | Acme | connected'),
        messageTimestamp: '2026-09-10T04:59:00.000Z',
      },
      dependencies,
    );

    expect(dependencies.repository.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: '2026-09-10T04:59:00.000Z' }),
    );
  });

  it('short-circuits CRM mutation after the durable crm_committed phase', async () => {
    const dependencies = base();
    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected'),
        dependencies,
        { status: 'crm_committed', activityId: getTelegramActivityId(42) },
      ),
    ).resolves.toEqual({
      status: 'logged',
      activityId: getTelegramActivityId(42),
      companyName: 'Acme',
    });
    expect(dependencies.repository.findCompanies).not.toHaveBeenCalled();
    expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Logged Acme. Use /today to review your day.',
    );
  });

  it('marks the CRM commit before attempting a confirmation', async () => {
    const dependencies = base();
    const order: string[] = [];
    dependencies.onCrmCommitted = vi.fn(async () => {
      order.push('committed');
    });
    dependencies.send.mockImplementation(async () => {
      order.push('confirm');
      throw new Error('Telegram timed out');
    });

    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected | renewal chat'),
        dependencies,
      ),
    ).rejects.toThrow('Telegram timed out');
    expect(order).toEqual(['committed', 'confirm']);
  });

  it('surfaces CRM failure for retry instead of claiming a parse error', async () => {
    const dependencies = base();
    dependencies.repository.createActivity = vi
      .fn()
      .mockRejectedValue(new Error('CRM unavailable'));

    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected'),
        dependencies,
      ),
    ).rejects.toThrow('CRM unavailable');
    expect(dependencies.send).not.toHaveBeenCalled();
  });

  it('retries confirmation after a committed deterministic write without a second activity', async () => {
    const dependencies = base();
    const records = new Map<string, unknown>();
    dependencies.repository.createActivity = vi.fn(async (data) => {
      records.set(data.id, data);
      return { id: data.id };
    });
    dependencies.send
      .mockRejectedValueOnce(new Error('confirmation timeout'))
      .mockResolvedValueOnce(undefined);

    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected'),
        dependencies,
      ),
    ).rejects.toThrow('confirmation timeout');
    await expect(
      processTelegramCommand(
        update('/log call | Acme | connected'),
        dependencies,
      ),
    ).resolves.toMatchObject({ status: 'logged' });
    expect(records.size).toBe(1);
    expect([...records.keys()]).toEqual([getTelegramActivityId(42)]);
  });

  it('returns an empty current-day summary using the configured timezone', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(update('/today'), dependencies),
    ).resolves.toEqual({ status: 'summary' });
    expect(dependencies.repository.listActivities).toHaveBeenCalledWith({
      start: '2026-09-09T05:00:00.000Z',
      end: '2026-09-10T05:00:00.000Z',
      wholesalerId: 'wholesaler-1',
    });
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Nash — 2026-09-09\nTotal: 0\nNo outreach logged.',
    );
  });

  it('does not advertise or pretend to cancel nonexistent drafts', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(update('/cancel'), dependencies),
    ).resolves.toEqual({ status: 'help' });
    expect(dependencies.store.delete).not.toHaveBeenCalled();
    expect(dependencies.send).not.toHaveBeenCalledWith(
      '101',
      expect.stringContaining('/cancel'),
    );
    expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
  });
});
