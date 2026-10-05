import {
  getCorgiCelebrationPreferenceKey,
  getCorgiCelebrationsEnabled,
} from '@/corgi-crm/events/utils/corgiCelebrationPreferences';
import { consumeCorgiWins } from '@/corgi-crm/events/utils/consumeCorgiWins';
import { type CorgiWin } from '@/corgi-crm/types/CorgiHome';
import { getCorgiRecordPath } from '@/corgi-crm/utils/corgiHomePresentation';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useEffect, useRef, useState } from 'react';

const StyledConfetti = styled.div`
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
  z-index: 9999;
  span {
    animation: corgi-confetti-fall 1800ms ease-out forwards;
    height: 9px;
    position: absolute;
    top: -12px;
    width: 6px;
  }
  @keyframes corgi-confetti-fall {
    to {
      opacity: 0;
      transform: translateY(75vh) rotate(480deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

export const CorgiLiveEvents = ({
  wins,
  ready,
  serverTime,
  workspaceId,
  workspaceMemberId,
}: {
  wins: CorgiWin[];
  ready: boolean;
  serverTime?: string;
  workspaceId: string;
  workspaceMemberId: string;
}) => {
  const { enqueueInfoSnackBar } = useSnackBar();
  const [celebrating, setCelebrating] = useState(false);
  // IDs only: retaining titles locally would outlive source-record permission changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const history = useRef<{
    initialized: boolean;
    seenIds: string[];
    startedAt?: string;
  }>({
    initialized: false,
    seenIds: [],
  });
  const storageKey = `corgi-seen-wins:${workspaceId}:${workspaceMemberId}`;

  useEffect(() => {
    if (!ready) return;
    if (!history.current.initialized) {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem(storageKey) ?? '[]',
        );
        if (Array.isArray(stored))
          history.current.seenIds = stored
            .filter((id): id is string => typeof id === 'string')
            .slice(-500);
      } catch {
        // Storage can be unavailable in private browsing.
      }
    }
    const startedAt = history.current.startedAt ?? serverTime;
    const consumed = consumeCorgiWins({ wins, ...history.current, startedAt });
    history.current = {
      initialized: true,
      seenIds: consumed.seenIds,
      startedAt,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(consumed.seenIds));
    } catch {
      // In-memory replay protection remains active.
    }
    for (const win of consumed.freshWins) {
      const eventLabel =
        win.kind === 'meeting-booked'
          ? t`Meeting booked`
          : win.kind === 'meeting-taken'
            ? t`Meeting taken`
            : t`Allocation logged`;
      enqueueInfoSnackBar({
        message: `${eventLabel}: ${win.record.label}`,
        options: {
          dedupeKey: win.id,
          buttonLabel: t`Open profile`,
          buttonTo: getCorgiRecordPath(win.record),
          duration: 6500,
        },
      });
      const celebrationsEnabled = getCorgiCelebrationsEnabled(
        getCorgiCelebrationPreferenceKey(workspaceId, workspaceMemberId),
      );
      if (
        win.isCreation &&
        win.actorWorkspaceMemberId === workspaceMemberId &&
        celebrationsEnabled &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        setCelebrating(true);
    }
  }, [
    wins,
    serverTime,
    ready,
    enqueueInfoSnackBar,
    storageKey,
    workspaceId,
    workspaceMemberId,
  ]);

  useEffect(() => {
    if (!celebrating) return;
    const timeout = window.setTimeout(() => setCelebrating(false), 1900);
    return () => window.clearTimeout(timeout);
  }, [celebrating]);

  return celebrating ? (
    <StyledConfetti aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            background: [
              themeCssVariables.color.blue,
              themeCssVariables.color.green,
              themeCssVariables.color.purple,
              themeCssVariables.color.orange,
            ][index % 4],
            animationDelay: `${(index % 5) * 70}ms`,
          }}
        />
      ))}
    </StyledConfetti>
  ) : null;
};
