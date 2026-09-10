import { describe, expect, it, vi } from 'vitest';

import { TelegramDeliveryError } from 'src/modules/telegram/services/telegram-client.service';
import { handleTelegramNotificationDeliveryJob } from 'src/modules/telegram/telegram-notification-delivery-worker.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const job = {
  version: 1,
  event: {
    type: 'meeting_booked',
    meetingId: '22222222-2222-4222-8222-222222222222',
    bookedAt: '2026-09-10T05:30:00.000Z',
    scheduledAt: '2026-09-15T19:00:00.000Z',
    riaName: 'RIA',
    ownerName: 'Nash',
  },
  route: { event: 'meeting_booked', chatId: '-1001', messageThreadId: 42 },
  timeZone: 'America/Chicago',
};
const routesJson = JSON.stringify({ version: 1, routes: [job.route] });
const context = { workspaceId: WORKSPACE_ID } as never;

const makeDependencies = (sendMessage = vi.fn().mockResolvedValue(undefined)) => {
  const values = new Map<string, any>();
  return {
    sendMessage,
    dependencies: {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'true',
      routesJson,
      store: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        set: vi.fn(async (key: string, value: unknown) => {
          values.set(key, value);
        }),
        delete: vi.fn(),
      },
      repository: undefined,
      createRepository: undefined,
      createTelegramClient: () => ({ sendMessage }),
      now: () => new Date('2026-09-10T05:31:00.000Z'),
    },
  };
};

describe('Telegram notification delivery worker', () => {
  it('does not parse or construct the provider while disabled', async () => {
    const createTelegramClient = vi.fn();
    const createRepository = vi.fn();
    await expect(
      handleTelegramNotificationDeliveryJob({ invalid: true }, context, {
        expectedWorkspaceId: WORKSPACE_ID,
        enabled: 'false',
        routesJson: '{bad',
        store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
        createRepository,
        createTelegramClient,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ status: 'disabled' });
    expect(createTelegramClient).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('revalidates the exact destination and preserves its forum topic', async () => {
    const { dependencies, sendMessage } = makeDependencies();
    await expect(
      handleTelegramNotificationDeliveryJob(job, context, dependencies),
    ).resolves.toEqual({ status: 'complete' });
    expect(sendMessage).toHaveBeenCalledWith(
      '-1001',
      expect.stringContaining('🎉 NEW MEETING BOOKED! 🎉'),
      42,
    );
  });

  it('never sends when the queued destination is no longer trusted', async () => {
    const { dependencies, sendMessage } = makeDependencies();
    dependencies.routesJson = JSON.stringify({ version: 1, routes: [] });
    await expect(
      handleTelegramNotificationDeliveryJob(job, context, dependencies),
    ).resolves.toEqual({ status: 'untrusted-route' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('marks an ambiguous provider result terminal unknown and never resends', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValue(new TelegramDeliveryError('ambiguous', true));
    const { dependencies } = makeDependencies(sendMessage);
    await expect(
      handleTelegramNotificationDeliveryJob(job, context, dependencies),
    ).resolves.toEqual({ status: 'unknown' });
    await expect(
      handleTelegramNotificationDeliveryJob(job, context, dependencies),
    ).resolves.toEqual({ status: 'unknown' });
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('requests a queue retry only for a provider-declared rejection', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValue(new TelegramDeliveryError('rejected', false));
    const { dependencies } = makeDependencies(sendMessage);
    await expect(
      handleTelegramNotificationDeliveryJob(job, context, dependencies),
    ).rejects.toMatchObject({ name: 'RetryableLogicFunctionError' });
  });
});
