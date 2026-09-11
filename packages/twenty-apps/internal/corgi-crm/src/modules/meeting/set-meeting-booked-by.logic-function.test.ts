import { describe, expect, it, vi } from 'vitest';

import { handleSetMeetingBookedBy } from 'src/modules/meeting/set-meeting-booked-by.logic-function';

const uuid = (n: string) => `0000000${n}-0000-4000-8000-000000000000`;
const WORKSPACE_ID = uuid('1');
const CALLER_ID = uuid('2');
const MEETING_ID = uuid('3');
const TARGET_ID = uuid('4');

const context = { workspaceId: WORKSPACE_ID, workspaceMemberId: CALLER_ID };
const body = { meetingId: MEETING_ID, bookedById: TARGET_ID };

const deps = (overrides: Record<string, unknown> = {}) => ({
  expectedWorkspaceId: WORKSPACE_ID,
  createMeetingRepository: () => ({
    get: vi.fn().mockResolvedValue({ id: MEETING_ID }),
    setBookedBy: vi.fn().mockResolvedValue(true),
  }),
  createMemberRepository: () => ({
    findWorkspaceMemberById: vi
      .fn()
      .mockResolvedValue({ id: TARGET_ID, active: true }),
  }),
  ...overrides,
}) as never;

describe('handleSetMeetingBookedBy', () => {
  // Booking on someone else's behalf is the reason this exists.
  it('lets a caller attribute a meeting to a different member', async () => {
    const response = await handleSetMeetingBookedBy(
      { body },
      context as never,
      deps(),
    );
    expect(response).toMatchObject({ status: 200 });
  });

  it.each([
    ['a foreign workspace', { workspaceId: uuid('9'), workspaceMemberId: CALLER_ID }],
    ['an unauthenticated caller', { workspaceId: WORKSPACE_ID }],
  ])('denies %s', async (_n, ctx) => {
    const response = await handleSetMeetingBookedBy({ body }, ctx as never, deps());
    expect(response).toMatchObject({ status: 403 });
  });

  it('denies a body carrying an unexpected key rather than ignoring it', async () => {
    const response = await handleSetMeetingBookedBy(
      { body: { ...body, wholesalerId: uuid('8') } },
      context as never,
      deps(),
    );
    expect(response).toMatchObject({ status: 403 });
  });

  it('refuses a member that does not exist', async () => {
    const response = await handleSetMeetingBookedBy({ body }, context as never, deps({
      createMemberRepository: () => ({
        findWorkspaceMemberById: vi.fn().mockResolvedValue(null),
      }),
    }));
    expect(response).toMatchObject({ status: 400 });
  });

  it('reports a write that did not persist as retryable rather than success', async () => {
    const response = await handleSetMeetingBookedBy({ body }, context as never, deps({
      createMeetingRepository: () => ({
        get: vi.fn().mockResolvedValue({ id: MEETING_ID }),
        setBookedBy: vi.fn().mockResolvedValue(false),
      }),
    }));
    expect(response).toMatchObject({ status: 503 });
  });
});
