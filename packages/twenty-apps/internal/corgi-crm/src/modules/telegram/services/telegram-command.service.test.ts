import { describe, expect, it, vi } from 'vitest';

import { processTelegramCommand } from 'src/modules/telegram/services/telegram-command.service';
import { getTelegramActivityId } from 'src/modules/telegram/services/telegram-identifiers.service';
import { type OutreachRepository } from 'src/modules/outreach/types';
import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';

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
    findCompanies: vi
      .fn()
      .mockResolvedValue([{ id: 'company-1', name: 'Acme' }]),
    findContacts: vi.fn().mockResolvedValue([]),
    createActivity: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    listActivities: vi.fn().mockResolvedValue([]),
  };
  return {
    values,
    store,
    repository,
    meetingRepository: { listMeetingBookings: vi.fn().mockResolvedValue([]) },
    wholesalerRoleReader: { findRolesByIds: vi.fn().mockResolvedValue([]) },
    timeZone: 'America/Chicago',
    publicReportsEnabled: 'false',
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
  chatScope: 'private' as const,
});

const groupUpdate = (text: string) => ({
  ...update(text),
  chatId: '-1002394851554',
  chatScope: 'group_topic' as const,
  messageThreadId: 304311,
});

describe('processTelegramCommand', () => {
  it('reuses the original report after safe rejection even when CRM data changes', async () => {
    const dependencies = base();
    dependencies.publicReportsEnabled = 'true';
    dependencies.values.delete('telegram:user:101');
    dependencies.send.mockRejectedValueOnce(
      new TelegramDeliveryError('rate limit', false),
    );
    await expect(
      processTelegramCommand(update('/daily'), dependencies),
    ).rejects.toThrow('rate limit');
    const original = dependencies.send.mock.calls[0]?.[1];
    dependencies.repository.listActivities = vi
      .fn()
      .mockRejectedValue(new Error('must not requery'));
    dependencies.meetingRepository.listMeetingBookings.mockRejectedValue(new Error('must not requery bookings'));
    await expect(
      processTelegramCommand(update('/daily'), dependencies),
    ).resolves.toMatchObject({ status: 'report' });
    expect(dependencies.send.mock.calls[1]?.[1]).toBe(original);
    expect(dependencies.repository.listActivities).not.toHaveBeenCalled();
    expect(dependencies.meetingRepository.listMeetingBookings).toHaveBeenCalledOnce();
  });

  it.each([
    ['/daily', 'daily', '2026-09-08T16:30:00.000Z', 'Daily outreach report'],
    [
      '/weekly@CorgiCrmBot',
      'weekly',
      '2026-09-02T16:30:00.000Z',
      'Weekly outreach report',
    ],
    [
      '/monthly',
      'monthly',
      '2026-08-10T16:30:00.000Z',
      'Monthly outreach report',
    ],
  ])(
    'returns a workspace report for %s without restricting the owner',
    async (command, period, start, title) => {
      const dependencies = base();
      dependencies.repository.listActivities = vi.fn().mockResolvedValue([
        {
          id: 'activity-2',
          wholesalerId: 'owner-2',
          wholesalerName: 'Jordan',
          companyName: 'Private company',
          contactName: 'Private contact',
          notes: 'Private notes',
          activityType: 'phone_call',
          outcome: 'connected',
          occurredAt: '2026-09-09T15:30:00.000Z',
        },
      ]);
      dependencies.meetingRepository.listMeetingBookings.mockResolvedValue([{
        id: 'booking-1',
        bookedAt: '2026-09-09T15:30:00.000Z',
        scheduledAt: '2026-10-01T15:00:00.000Z',
        wholesalerId: 'owner-booker',
        wholesalerName: 'Casey',
      }]);

      await expect(
        processTelegramCommand(update(command!), dependencies),
      ).resolves.toEqual({ status: 'report', period });
      expect(dependencies.repository.listActivities).toHaveBeenCalledWith({
        start,
        end: '2026-09-09T16:30:00.000Z',
      });
      expect(dependencies.meetingRepository.listMeetingBookings).toHaveBeenCalledWith({
        start,
        end: '2026-09-09T16:30:00.000Z',
      });
      const message = dependencies.send.mock.calls
        .map(([, text]) => text)
        .join('\n');
      expect(message).toContain(title);
      expect(message).toContain('Total activities: 1');
      expect(message).toContain('🥇 Jordan: 1');
      expect(message).toContain('Meetings set: 1');
      expect(message).toContain('🥈 Casey: 0 activities · 1 meeting set');
      expect(message).not.toContain('Private');
    },
  );

  it.each([undefined, 'false', 'TRUE', '1'])(
    'keeps public reports closed for an unlinked sender when the gate is %s',
    async (publicReportsEnabled) => {
      const dependencies = base();
      dependencies.publicReportsEnabled = publicReportsEnabled as string;
      dependencies.values.delete('telegram:user:101');

      await expect(
        processTelegramCommand(update('/daily'), dependencies),
      ).resolves.toEqual({ status: 'not_linked' });
      expect(dependencies.repository.listActivities).not.toHaveBeenCalled();
      expect(
        dependencies.meetingRepository.listMeetingBookings,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['/daily', '/weekly', '/monthly'])(
    'requires a current identity before the %s report',
    async (command) => {
      const dependencies = base();
      dependencies.identity.findWorkspaceMember.mockResolvedValue(null);
      await expect(
        processTelegramCommand(update(command), dependencies),
      ).resolves.toEqual({ status: 'not_linked' });
      expect(dependencies.repository.listActivities).not.toHaveBeenCalled();
      expect(dependencies.meetingRepository.listMeetingBookings).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['/daily', 'daily'],
    ['/weekly', 'weekly'],
    ['/monthly', 'monthly'],
  ] as const)(
    'allows an unlinked sender to read the public %s workspace report',
    async (command, period) => {
      const dependencies = base();
      dependencies.publicReportsEnabled = 'true';
      dependencies.values.delete('telegram:user:101');

      await expect(
        processTelegramCommand(update(command), dependencies),
      ).resolves.toEqual({ status: 'report', period });
      expect(dependencies.repository.listActivities).toHaveBeenCalledOnce();
      expect(
        dependencies.meetingRepository.listMeetingBookings,
      ).toHaveBeenCalledOnce();
      expect(
        dependencies.identity.findWorkspaceMember,
      ).not.toHaveBeenCalled();
      expect(dependencies.identity.findWholesalers).not.toHaveBeenCalled();
    },
  );

  it('does not send or persist a misleading zero when the meeting report read fails', async () => {
    const dependencies = base();
    dependencies.meetingRepository.listMeetingBookings.mockRejectedValue(new Error('Meeting read unavailable'));
    await expect(processTelegramCommand(update('/daily'), dependencies)).rejects.toThrow('Meeting read unavailable');
    expect(dependencies.send).not.toHaveBeenCalled();
    expect(dependencies.values.has('telegram:report:interactive:42:/daily')).toBe(false);
  });

  // The regression that took the production bot down in v1.2.10: an unreadable
  // wholesaler role threw out of the report instead of degrading its section.
  it('still delivers the report when the wholesaler role read fails', async () => {
    const dependencies = base();
    dependencies.repository.listActivities = vi.fn().mockResolvedValue([
      {
        id: 'activity-1',
        wholesalerId: '11111111-1111-4111-8111-111111111111',
        wholesalerName: 'Jordan',
        companyName: 'Acme',
        activityType: 'phone_call',
        outcome: 'connected',
        occurredAt: '2026-09-09T15:30:00.000Z',
      },
    ]);
    dependencies.wholesalerRoleReader.findRolesByIds.mockRejectedValue(
      new Error('Wholesaler query is not permitted for this role'),
    );

    await expect(
      processTelegramCommand(update('/daily'), dependencies),
    ).resolves.toEqual({ status: 'report', period: 'daily' });
    const message = dependencies.send.mock.calls
      .map(([, text]) => text)
      .join('\n');
    expect(message).toContain('Total activities: 1');
    expect(message).toContain('\u{1f3c6} Activity leaderboard');
    expect(message).toContain('\u{1f4b0} ARR attributed per EW');
    expect(message).toContain(
      'Wholesaler roles could not be read for this report, so the EW breakdown is unavailable.',
    );
    expect(message).not.toMatch(/permitted|Error/);
  });

  it('lists each EW at $0 and leaves BDRs out of the delivered report', async () => {
    const dependencies = base();
    dependencies.repository.listActivities = vi.fn().mockResolvedValue([
      {
        id: 'activity-1',
        wholesalerId: '11111111-1111-4111-8111-111111111111',
        wholesalerName: 'Jordan',
        companyName: 'Acme',
        activityType: 'phone_call',
        outcome: 'connected',
        occurredAt: '2026-09-09T15:30:00.000Z',
      },
    ]);
    dependencies.wholesalerRoleReader.findRolesByIds.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Jordan',
        wholesalerRole: ' ew ',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Sam',
        wholesalerRole: 'BDR',
      },
    ]);

    await processTelegramCommand(update('/daily'), dependencies);
    const message = dependencies.send.mock.calls
      .map(([, text]) => text)
      .join('\n');
    expect(dependencies.wholesalerRoleReader.findRolesByIds).toHaveBeenCalledWith([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(message).toContain('\u{1f4b0} ARR attributed per EW');
    expect(message).toContain('\u2022 Jordan: $0');
    expect(message).not.toContain('Sam');
  });

  it('splits a large leaderboard into Telegram-safe messages without dropping owners', async () => {
    const dependencies = base();
    dependencies.repository.listActivities = vi.fn().mockResolvedValue(
      Array.from({ length: 400 }, (_, index) => ({
        id: `activity-${index}`,
        wholesalerId: `owner-${index}`,
        wholesalerName: `Owner ${String(index).padStart(3, '0')}`,
        companyName: 'Acme',
        activityType: 'phone_call',
        outcome: 'connected',
        occurredAt: '2026-09-09T15:30:00.000Z',
      })),
    );
    dependencies.meetingRepository.listMeetingBookings.mockResolvedValue(
      Array.from({ length: 400 }, (_, index) => ({
        id: `booking-${index}`,
        bookedAt: '2026-09-09T15:30:00.000Z',
        wholesalerId: `booker-${index}`,
        wholesalerName: `Booker ${String(index).padStart(3, '0')}`,
      })),
    );
    await processTelegramCommand(update('/daily'), dependencies);
    const parts = dependencies.send.mock.calls.map(
      ([, text]) => text as string,
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 4096)).toBe(true);
    const text = parts.join('\n');
    expect(text).toContain('Total activities: 400');
    expect(text).toContain('Meetings set: 400');
    for (let index = 0; index < 400; index += 1) {
      const rank = ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;
      expect(text).toContain(
        `${rank} Owner ${String(index).padStart(3, '0')}: 1 activity · 0 meetings set`,
      );
      expect(text).toContain(
        `${index + 401}. Booker ${String(index).padStart(3, '0')}: 0 activities · 1 meeting set`,
      );
    }
  });

  it('links a Telegram deep-link start payload through the existing identity checks', async () => {
    const dependencies = base();
    dependencies.values.delete('telegram:user:101');
    dependencies.linkCodesJson = JSON.stringify({
      bindings: [
        {
          code: 'test_link-code',
          telegramUserId: '101',
          workspaceMemberId: '11111111-1111-4111-8111-111111111111',
        },
      ],
    });

    await expect(
      processTelegramCommand(
        update('/start@CorgiCrmBot test_link-code'),
        dependencies,
      ),
    ).resolves.toEqual({ status: 'linked' });
    expect(dependencies.values.get('telegram:user:101')).toMatchObject({
      wholesalerId: 'wholesaler-1',
    });
    expect(dependencies.send).not.toHaveBeenCalledWith(
      '101',
      expect.stringContaining('test_link-code'),
    );
  });

  it('rejects a deep-link code bound to a different Telegram account', async () => {
    const dependencies = base();
    dependencies.values.delete('telegram:user:101');
    dependencies.linkCodesJson = JSON.stringify({
      bindings: [
        {
          code: 'test_link-code',
          telegramUserId: '202',
          workspaceMemberId: '11111111-1111-4111-8111-111111111111',
        },
      ],
    });

    await expect(
      processTelegramCommand(update('/start test_link-code'), dependencies),
    ).resolves.toEqual({ status: 'link_failed' });
    expect(dependencies.values.has('telegram:user:101')).toBe(false);
    expect(dependencies.identity.findWorkspaceMember).not.toHaveBeenCalled();
  });

  it('tells a bare /link to include a code instead of a generic invalid-code message', async () => {
    const dependencies = base();
    dependencies.values.delete('telegram:user:101');

    await expect(
      processTelegramCommand(update('/link'), dependencies),
    ).resolves.toEqual({ status: 'link_failed' });
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Add your one-time code after /link — for example: /link ABC123. Ask an administrator if you do not have one.',
    );
    expect(dependencies.identity.findWorkspaceMember).not.toHaveBeenCalled();
  });

  it('keeps a plain start as help and advertises the report commands', async () => {
    const dependencies = base();
    await expect(
      processTelegramCommand(update('/start'), dependencies),
    ).resolves.toEqual({ status: 'help' });
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      expect.stringContaining('/daily'),
    );
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      expect.stringContaining('/weekly'),
    );
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      expect.stringContaining('/monthly'),
    );
  });

  it.each([
    ['/log call | Acme | connected', 'write'],
    ['/today', 'personal read'],
    ['/summary', 'personal read alias'],
  ])(
    'does not let the public-report gate authorize an unlinked %s',
    async (command) => {
      const dependencies = base();
      dependencies.publicReportsEnabled = 'true';
      dependencies.values.delete('telegram:user:101');

      await expect(
        processTelegramCommand(update(command), dependencies),
      ).resolves.toEqual({ status: 'not_linked' });
      expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
      expect(dependencies.repository.listActivities).not.toHaveBeenCalled();
      expect(dependencies.send).toHaveBeenCalledWith(
        '101',
        'Link your CRM identity first with /link CODE.',
      );
    },
  );

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

  it('explains why a /log entry was rejected instead of dumping the full command guide', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(
        update('/log sms | Acme | connected'),
        dependencies,
      ),
    ).resolves.toEqual({ status: 'invalid_log' });
    expect(dependencies.send).toHaveBeenCalledWith(
      '101',
      'Unsupported activity type: sms\n/log call | Company | outcome | notes\n/log type=meeting; company=Company; contact=Name; outcome=follow_up_scheduled; notes=Next step; followup=YYYY-MM-DD',
    );
    expect(dependencies.repository.findCompanies).not.toHaveBeenCalled();
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

  it.each([
    ['/log call | Acme | connected'],
    ['/log@CorgiCrmBot call | Acme | connected'],
    ['/link ABC123'],
    ['/start ABC123'],
    ['/today'],
    ['/summary'],
    ['today'],
  ])(
    'refuses %s in a group topic without writing or revealing CRM identity',
    async (text) => {
      const dependencies = base();

      await expect(
        processTelegramCommand(groupUpdate(text!), dependencies),
      ).resolves.toEqual({ status: 'group_command_refused' });
      expect(dependencies.send).toHaveBeenCalledOnce();
      expect(dependencies.send.mock.calls[0]?.[0]).toBe('-1002394851554');
      expect(dependencies.send.mock.calls[0]?.[1]).toMatch(
        /direct message with the bot/i,
      );
      expect(dependencies.repository.createActivity).not.toHaveBeenCalled();
      expect(dependencies.repository.listActivities).not.toHaveBeenCalled();
      expect(dependencies.store.set).not.toHaveBeenCalled();
      expect(dependencies.onCrmCommitted).not.toHaveBeenCalled();
    },
  );

  it('keeps a group refusal from naming any linked identity', async () => {
    const dependencies = base();

    await processTelegramCommand(groupUpdate('/today'), dependencies);
    expect(dependencies.send.mock.calls[0]?.[1]).not.toMatch(/Nash/);
    expect(dependencies.identity.findWholesalers).not.toHaveBeenCalled();
    expect(dependencies.identity.findWorkspaceMember).not.toHaveBeenCalled();
  });

  it.each([['/daily'], ['/weekly'], ['/monthly']])(
    'serves the public workspace report %s in a group topic',
    async (command) => {
      const dependencies = base();
      dependencies.publicReportsEnabled = 'true';

      await expect(
        processTelegramCommand(groupUpdate(command!), dependencies),
      ).resolves.toMatchObject({ status: 'report' });
      expect(dependencies.send.mock.calls[0]?.[0]).toBe('-1002394851554');
      expect(dependencies.identity.findWholesalers).not.toHaveBeenCalled();
    },
  );

  it('refuses a group report instead of asking a group to link', async () => {
    const dependencies = base();
    dependencies.publicReportsEnabled = 'false';

    await expect(
      processTelegramCommand(groupUpdate('/daily'), dependencies),
    ).resolves.toEqual({ status: 'group_reports_disabled' });
    expect(dependencies.send.mock.calls[0]?.[1]).toMatch(/not enabled/i);
    expect(dependencies.send.mock.calls[0]?.[1]).not.toMatch(/\/link CODE/);
    expect(dependencies.identity.findWholesalers).not.toHaveBeenCalled();
  });

  it('answers group help without advertising identity commands', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(groupUpdate('/help'), dependencies),
    ).resolves.toEqual({ status: 'help' });
    const reply = dependencies.send.mock.calls[0]?.[1] as string;
    expect(reply).toContain('/daily');
    expect(reply).toContain('/weekly');
    expect(reply).toContain('/monthly');
    expect(reply).not.toContain('/link CODE —');
    expect(reply).not.toContain('/log call |');
  });

  it('leaves the private-chat guide and link flow untouched', async () => {
    const dependencies = base();

    await expect(
      processTelegramCommand(update('/help'), dependencies),
    ).resolves.toEqual({ status: 'help' });
    const reply = dependencies.send.mock.calls[0]?.[1] as string;
    expect(reply).toContain('/link CODE');
    expect(reply).toContain('/today');
    expect(dependencies.send.mock.calls[0]?.[0]).toBe('101');
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
