import { describe, expect, it, vi } from 'vitest';

import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import { getTelegramActivityId } from 'src/modules/telegram/services/telegram-identifiers.service';
import { type OutreachRepository } from 'src/modules/outreach/types';

const base = () => {
  const values = new Map<string, unknown>();
  values.set('telegram:user:101', {
    userId: '101',
    chatId: '101',
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
    findWholesalers: vi.fn(),
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

  it('clears a draft without writing when canceled', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(update('/cancel'), dependencies),
    ).resolves.toEqual({ status: 'canceled' });
    expect(dependencies.store.delete).toHaveBeenCalledWith('telegram:draft:101');
    expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
  });
});
