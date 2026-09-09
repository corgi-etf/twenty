import { describe, expect, it, vi } from 'vitest';

import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
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
