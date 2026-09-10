import { describe, expect, it, vi } from 'vitest';

import {
  handleTelegramMeetingBookedEvent,
  type MeetingBookedUpdatePayload,
} from 'src/modules/telegram/telegram-meeting-booked-alert.logic-function';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MEETING_ID = '22222222-2222-4222-8222-222222222222';
const BOOKED_AT = '2026-09-10T05:30:00.000Z';
const payload = {
  workspaceId: WORKSPACE_ID,
  recordId: MEETING_ID,
  properties: {
    updatedFields: ['bookedAt'],
    before: { bookedAt: null },
    after: { bookedAt: BOOKED_AT },
  },
} as MeetingBookedUpdatePayload;

const routesJson = JSON.stringify({
  version: 1,
  routes: [
    { event: 'meeting_booked', chatId: '-1001' },
    { event: 'meeting_booked', chatId: '-1002', messageThreadId: 42 },
  ],
});

describe('meeting booked Telegram event ingress', () => {
  it('does nothing before parsing or CRM access while disabled', async () => {
    const dependencies = {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'false',
      routesJson: '{bad',
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      readMeetingBooking: vi.fn(),
      enqueue: vi.fn(),
    };
    await expect(
      handleTelegramMeetingBookedEvent(
        { workspaceId: WORKSPACE_ID, invalid: true } as never,
        dependencies,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(dependencies.store.get).not.toHaveBeenCalled();
    expect(dependencies.readMeetingBooking).not.toHaveBeenCalled();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it('accepts only the bookedAt null-to-timestamp transition', async () => {
    const readMeetingBooking = vi.fn();
    const enqueue = vi.fn();
    for (const candidate of [
      { ...payload, properties: { ...payload.properties, updatedFields: ['status'] } },
      { ...payload, properties: { ...payload.properties, before: { bookedAt: BOOKED_AT } } },
      { ...payload, properties: { ...payload.properties, after: { id: MEETING_ID, bookedAt: null } } },
    ]) {
      await expect(
        handleTelegramMeetingBookedEvent(candidate as never, {
          expectedWorkspaceId: WORKSPACE_ID,
          enabled: 'true',
          routesJson,
          store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
          readMeetingBooking,
          enqueue,
        }),
      ).resolves.toMatchObject({ status: 'ignored' });
    }
    expect(readMeetingBooking).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('snapshots once and enqueues one deterministic job per destination', async () => {
    const values = new Map<string, unknown>();
    const enqueue = vi.fn().mockResolvedValue({
      enqueued: true,
      enqueuedJobsCount: 2,
    });
    const dependencies = {
      expectedWorkspaceId: WORKSPACE_ID,
      enabled: 'true',
      routesJson,
      timeZone: 'America/Chicago',
      store: {
        get: vi.fn(async (key: string) => values.get(key) ?? null),
        set: vi.fn(async (key: string, value: unknown) => {
          values.set(key, value);
        }),
        delete: vi.fn(),
      },
      readMeetingBooking: vi.fn().mockResolvedValue({
        id: MEETING_ID,
        status: 'BOOKED',
        bookedAt: BOOKED_AT,
        scheduledAt: '2026-09-15T19:00:00.000Z',
        company: { id: '33333333-3333-4333-8333-333333333333', name: 'RIA' },
        wholesaler: { id: '44444444-4444-4444-8444-444444444444', name: 'Nash' },
        bookedBy: null,
      }),
      enqueue,
    };

    await expect(handleTelegramMeetingBookedEvent(payload, dependencies)).resolves.toEqual({
      status: 'enqueued',
      destinations: 2,
    });
    const jobs = enqueue.mock.calls[0]![0];
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job: { jobId: string }) => job.jobId)).size).toBe(2);
    expect(jobs[1].payload.route).toEqual({
      event: 'meeting_booked',
      chatId: '-1002',
      messageThreadId: 42,
    });

    await handleTelegramMeetingBookedEvent(payload, dependencies);
    expect(dependencies.readMeetingBooking).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[1]![0].map((job: { jobId: string }) => job.jobId)).toEqual(
      jobs.map((job: { jobId: string }) => job.jobId),
    );
  });

  it('refuses a mismatched workspace before dependencies', async () => {
    const readMeetingBooking = vi.fn();
    await expect(
      handleTelegramMeetingBookedEvent(payload, {
        expectedWorkspaceId: '99999999-9999-4999-8999-999999999999',
        enabled: 'true',
        routesJson,
        timeZone: 'America/Chicago',
        store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
        readMeetingBooking,
        enqueue: vi.fn(),
      }),
    ).rejects.toThrow(/workspace/i);
    expect(readMeetingBooking).not.toHaveBeenCalled();
  });
});
