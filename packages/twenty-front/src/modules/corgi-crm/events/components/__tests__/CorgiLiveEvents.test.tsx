import { CorgiLiveEvents } from '@/corgi-crm/events/components/CorgiLiveEvents';
import {
  getCorgiCelebrationPreferenceKey,
  setCorgiCelebrationsEnabled,
} from '@/corgi-crm/events/utils/corgiCelebrationPreferences';
import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';
import { render } from '@testing-library/react';

const mockNotify = jest.fn();
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueInfoSnackBar: mockNotify }),
}));

const event = (actor = 'me'): CorgiWin => ({
  id: 'allocation-logged:record',
  kind: 'allocation-logged',
  record: {
    id: 'record',
    objectNameSingular: 'companyAllocation',
    objectNamePlural: 'companyAllocations',
    label: 'Recorded allocation',
  },
  actorName: 'Creator',
  actorWorkspaceMemberId: actor,
  recordedAt: '2026-10-05T16:00:00Z',
  effectiveAt: '2026-10-01T16:00:00Z',
  isCreation: true,
});
const renderEvents = () =>
  render(
    <CorgiLiveEvents
      wins={[]}
      ready
      serverTime="2026-10-05T15:00:00Z"
      workspaceId="workspace"
      workspaceMemberId="me"
    />,
  );

describe('Persistent live wins', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNotify.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
  });
  it('notifies once with a canonical link and celebrates only the creator', () => {
    const { rerender, container } = renderEvents();
    const wins = [event()];
    rerender(
      <CorgiLiveEvents
        wins={wins}
        ready
        serverTime="2026-10-05T16:01:00Z"
        workspaceId="workspace"
        workspaceMemberId="me"
      />,
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          buttonTo: '/object/companyAllocation/record',
          dedupeKey: wins[0].id,
        }),
      }),
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    rerender(
      <CorgiLiveEvents
        wins={[event()]}
        ready
        serverTime="2026-10-05T16:02:00Z"
        workspaceId="workspace"
        workspaceMemberId="me"
      />,
    );
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
  it.each(['another-user', 'reduced-motion', 'opt-out'])(
    'keeps notifications without confetti for %s',
    (reason) => {
      if (reason === 'reduced-motion')
        jest
          .mocked(window.matchMedia)
          .mockReturnValue({ matches: true } as MediaQueryList);
      if (reason === 'opt-out')
        setCorgiCelebrationsEnabled(
          getCorgiCelebrationPreferenceKey('workspace', 'me'),
          false,
        );
      const { rerender, container } = renderEvents();
      rerender(
        <CorgiLiveEvents
          wins={[event(reason === 'another-user' ? 'colleague' : 'me')]}
          ready
          serverTime="2026-10-05T16:01:00Z"
          workspaceId="workspace"
          workspaceMemberId="me"
        />,
      );
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    },
  );
});
